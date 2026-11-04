/**
 * Sandbox entry point: wires the 3D body, the senses, the voice, the brain and the UI.
 * Everything Vision does goes through executeInstructions(), the single motor gate.
 */
import { FaceId } from "./faceId.js";
import { Brain, ARENA, ARENA_INFINITE } from "./brain.js";
import { Senses } from "./senses.js";
import { voiceProfile, runScenario, SCENARIOS, PERSONALITIES, daylight, aiVerdict } from "./life.js";
import { WeatherFx } from "./weatherfx.js";
import { initLab } from "./lab.js";
import { askCortex, fetchHealth, loadMindState, saveMindState, deleteMindState } from "./cortexClient.js";
import { Steering, resolveOverlap } from "./steering.js";
import { SightTracker, worldDetections, arenaLabel } from "./vision.js";
import { Limbic } from "./limbic.js";
import { BrainRenderer } from "./brainview.js";
import { BrainPanel } from "./brainpanel.js";
import { buildCloud, buildFibres } from "./brainsim/geometry.js";
const banner = document.getElementById("protoBanner");
if (location.protocol === "file:") {
    banner.classList.add("show");
    throw new Error("Serve the page with `npm start`.");
}
if (!window.THREE) {
    document.getElementById("modelLoading").textContent = "Couldn't load three.js from cdnjs.cloudflare.com.";
    throw new Error("THREE missing");
}
const { Rig } = await import("./rig.js");
const { createSpeechController } = await import("./speech.js");
/** Embedded in the simulator shell: the mind controls (mode, face model, LLM badge, help, E-STOP) sit in the shell's top bar, so this page's own header is not shown. */
const shellDoc = (() => { try { return window.parent !== window && window.parent.document.getElementById("estop") ? window.parent.document : null; } catch { return null; } })();
const $ = (id) => (document.getElementById(id) ?? shellDoc?.getElementById(id));
if (shellDoc) { document.querySelector("header.top")?.remove(); requestAnimationFrame(() => window.dispatchEvent(new Event("resize"))); } // belt and braces: make the 3D view re-measure
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
// If his eyes look the wrong way for you, set GAZE_FLIP to true.
const GAZE_FLIP = false;
const eyeDir = () => (GAZE_FLIP ? -1 : 1);
let stopped = false; // true while E-STOP is engaged
let lastUserSpeechAt = -1e9; // he looks at you for a few seconds after you speak
// Base voice presets by mood word (rate, pitch). These are refined live by hormones.
const VOICE = {
    excited: [1.12, 1.2], curious: [1.05, 1.12], attentive: [1.0, 1.08], content: [1.0, 1.05], calm: [0.96, 1.0],
    bored: [0.9, 0.95], lonely: [0.92, 0.98], startled: [1.2, 1.25],
    happy: [1.06, 1.15], afraid: [1.18, 1.22], angry: [1.08, 0.85], sad: [0.86, 0.88], disgusted: [0.95, 0.9], hurt: [0.92, 1.1], sleepy: [0.8, 0.85],
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/**
 * Compute natural prosody from the emotional brain.
 * Rate / pitch / volume are shaped by current emotion + key neuromodulators
 * so the voice feels like it comes from the same organism as the decisions.
 */
function voiceFromBrain(mood) {
    const [baseRate, basePitch] = VOICE[mood] ?? [1.02, 1.05];
    const st = limbic.state();
    const nm = st.nm;
    // Arousal-like modulators speed speech up; calming ones slow it down
    const arousal = (nm.noradrenaline - 0.1) * 0.35 + (nm.adrenaline - 0.05) * 0.4 + (nm.dopamine - 0.1) * 0.2;
    const calm = (nm.serotonin - 0.4) * 0.25 + (nm.gaba - 0.3) * 0.15 + (nm.melatonin - 0.1) * 0.5;
    const stress = (nm.cortisol - 0.1) * 0.3;
    // Pitch rises with positive affect and arousal, drops with sadness / high cortisol
    const affect = st.emotion === "HAPPY" || st.emotion === "EXCITED" || st.emotion === "CURIOUS" ? 0.12
        : st.emotion === "SAD" || st.emotion === "PAIN" ? -0.12
            : st.emotion === "ANGRY" ? -0.08
                : st.emotion === "FEARFUL" || st.emotion === "SURPRISED" ? 0.1 : 0;
    const rate = clamp(baseRate + arousal * 0.35 - calm * 0.4 + stress * 0.15, 0.72, 1.45);
    const pitch = clamp(basePitch + affect + arousal * 0.18 - calm * 0.12 - stress * 0.1, 0.7, 1.55);
    // Slightly quieter when sleepy or very stressed, brighter when excited
    const volume = clamp(0.92 + (nm.dopamine - 0.1) * 0.25 - (nm.melatonin - 0.1) * 0.35 - Math.max(0, nm.cortisol - 0.25) * 0.2, 0.55, 1);
    return { rate, pitch, volume };
}
// ---------------------------------------------------------------- world ----
const world = []; // what Vision knows about (toys, landmarks)
const obstacles = []; // everything solid (he walks around these, known or not)
const steering = new Steering();
let unit = 1;
/** Solid things plus places that keep hurting him (he steers around those too). */
function steerObs() { const sp = brain.avoidSpots(); return sp.length ? obstacles.concat(sp.map((q, i) => ({ id: `pain${i}`, x: q.x * unit, z: q.z * unit, r: q.r * unit * 0.5 }))) : obstacles; }
let wandering = false, wanderHeading = 0, navActive = 0;
const bodyR = () => unit * 0.7; // robot body radius for collision purposes
const steerOpts = (ignore) => ({ body: bodyR(), lookahead: 7 * unit, margin: 0.5 * unit, ignore });
/**
 * Add a 3D object to the sandbox: either a model file (url: .glb/.gltf) or a built-in shape (shape: box|cylinder|sphere|cone).
 *  solid: Vision walks around it.   known: Vision (and the AI) can see it and walk to it.
 * x, z and size are in robot-sizes (x = right, z = forward from the start). Normally you list objects in
 * simulation/autonomous/scenery.json instead of calling this.
 */
let chargerPos = null;
const zones = [];
const sceneryList = [];
async function addScenery(o, save = true) {
    const px = o.x * unit, pz = o.z * unit;
    sceneryList.push(o);
    if (o.role === "charger") {
        chargerPos = { x: px, z: pz };
        Rig.addRing({ id: o.id + "_ring", x: px, z: pz, r: unit * 1.7 });
    }
    const { radius } = o.url
        ? await Rig.addModel({ id: o.id, url: o.url, x: px, z: pz, size: o.size, rotY: o.rotY })
        : await Rig.addShape({ id: o.id, shape: o.shape ?? "box", x: px, z: pz, size: o.size, rotY: o.rotY, color: o.color ? parseInt(o.color.replace("#", ""), 16) : undefined });
    if (o.solid !== false)
        obstacles.push({ id: o.id, x: px, z: pz, r: radius * 0.8 });
    if (o.known)
        world.push({ id: o.id, kind: "landmark", x: px, z: pz, color: o.color ?? "#ffffff", r: radius * 0.8 });
    if (save)
        saveLayout();
}
const LAYOUT_KEY = "vision.scenery.v1";
/** What you place with the Lab is kept in this browser, so it is still there after a reload. scenery.json is only the starting layout. */
function saveLayout() { try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ objects: sceneryList, zones: zones.map(({ x, z, r, temp }) => ({ x, z, r, temp })) }));
}
catch { /* ignore */ } }
function addZone(z, save = true) {
    const id = `zone_${Date.now().toString(36)}_${zones.length}`;
    zones.push({ ...z, id });
    Rig.addDisc({ id, x: z.x * unit, z: z.z * unit, r: z.r * unit, color: z.temp === "hot" ? 0xff6b35 : 0x4dabf7 });
    if (save)
        saveLayout();
}
function removeZone(id) { const i = zones.findIndex((q) => q.id === id); if (i < 0)
    return false; zones.splice(i, 1); Rig.removeProp(id); saveLayout(); return true; }
function clearLayout() { for (const o of [...sceneryList])
    removeScenery(o.id, false); for (const z of [...zones]) {
    Rig.removeProp(z.id);
} zones.length = 0; saveLayout(); }
async function resetLayout() { clearLayout(); try {
    localStorage.removeItem(LAYOUT_KEY);
}
catch { /* ignore */ } await loadScenery(true); }
function removeScenery(id, save = true) {
    const i = sceneryList.findIndex((o) => o.id === id);
    if (i < 0)
        return false;
    const o = sceneryList[i];
    sceneryList.splice(i, 1);
    Rig.removeProp(id);
    const oi = obstacles.findIndex((q) => q.id === id);
    if (oi >= 0)
        obstacles.splice(oi, 1);
    const wi = world.findIndex((q) => q.id === id);
    if (wi >= 0)
        world.splice(wi, 1);
    if (o.role === "charger") {
        chargerPos = null;
        Rig.removeProp(id + "_ring");
    }
    if (save)
        saveLayout();
    return true;
}
async function moveScenery(id, x, z) { const o = sceneryList.find((q) => q.id === id); if (!o)
    return false; const copy = { ...o, x, z }; removeScenery(id); await addScenery(copy); return true; }
/** Load simulation/autonomous/scenery.json (optional) and place every object in it. */
async function loadScenery(fromFileOnly = false) {
    let data = null;
    if (!fromFileOnly) {
        try {
            const raw = localStorage.getItem(LAYOUT_KEY);
            if (raw)
                data = JSON.parse(raw);
        }
        catch {
            data = null;
        }
    }
    if (!data) {
        try {
            const res = await fetch("scenery.json", { cache: "no-store" });
            if (res.ok)
                data = await res.json();
        }
        catch { /* no scenery file: the arena just has the toys */ }
    }
    if (!data)
        return;
    for (const z of Array.isArray(data.zones) ? data.zones : [])
        if (z && Number.isFinite(z.x) && Number.isFinite(z.z) && (z.temp === "hot" || z.temp === "cold"))
            addZone({ x: z.x, z: z.z, r: Number(z.r) || 6, temp: z.temp }, false);
    for (const o of Array.isArray(data.objects) ? data.objects : []) {
        try {
            await addScenery(o, false);
        }
        catch (e) {
            addLog("system", `scenery "${o?.id}" failed: ${e.message}`);
        }
    }
}
window.vision = { addScenery, world, obstacles, Rig }; // handy from the browser console
function placeProps() {
    unit = Rig.getPosition().unit;
    if (!ARENA_INFINITE)
        Rig.addProp({ id: "arena", kind: "ring", x: 0, z: 0, color: 0xa78bfa, radius: ARENA * unit });
    const add = (o) => { world.push(o); Rig.addProp({ id: o.id, kind: o.kind, x: o.x, z: o.z, color: parseInt(o.color.slice(1), 16), radius: unit }); obstacles.push({ id: o.id, x: o.x, z: o.z, r: unit * 0.35 }); };
    add({ id: "toy_red", kind: "toy", x: 14 * unit, z: 2 * unit, color: "#ef4444" });
    add({ id: "toy_blue", kind: "toy", x: -10 * unit, z: 18 * unit, color: "#38bdf8" });
    add({ id: "toy_green", kind: "toy", x: -16 * unit, z: -12 * unit, color: "#84cc16" });
}
// ------------------------------------------------------------- UI helpers --
let captionTimer;
function showCaption(role, text) {
    const el = $("caption");
    clearTimeout(captionTimer);
    el.className = `caption show ${role}`;
    el.replaceChildren();
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = role === "user" ? "You" : "Vision";
    el.append(who, document.createTextNode(text)); // textContent only: LLM output is never injected as HTML
    captionTimer = window.setTimeout(() => el.classList.remove("show"), role === "user" ? 2800 : 6000);
}
const TOASTS = [
    [/^grew: (.+)/, "good", (m) => "He grew: " + m.replace(/^grew: /, "")], [/asked for some space/, "warn", () => "He asked for some space"], [/^forgot (?!.*\bme\b)/, "info", (m) => "He forgot something: " + m.replace(/^forgot /, "")],
    [/^the sky is (.+)/, "info", (m) => "Sky: " + m.replace(/^the sky is /, "")], [/woke up/, "info", () => "He woke up"], [/restored saved mind/, "good", () => "Saved mind restored"], [/tripped a little/, "info", () => "He tripped"],
];
function toast(text, kind = "info") {
    const box = document.getElementById("toasts");
    if (!box)
        return;
    const t = document.createElement("div");
    t.className = "toast " + (kind === "info" ? "" : kind);
    t.textContent = text;
    box.append(t);
    while (box.childElementCount > 3)
        box.firstElementChild.remove();
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 320); }, 4200);
}
function addLog(type, text) {
    const log = $("log");
    const row = document.createElement("div");
    row.className = type;
    const t = document.createElement("time");
    t.textContent = new Date().toLocaleTimeString([], { hour12: false });
    row.append(t, document.createTextNode(text));
    log.prepend(row);
    while (log.childElementCount > 300)
        log.lastElementChild.remove();
}
// ---------------------------------------------------------- motor / voice --
let eyeLock = 0; // >0 while a scripted action is moving his eyes, so gaze tracking stays out of the way
let motionToken = 0; // bumping this cancels every in-flight GOTO / sequence loop
let busyCount = 0;
let voiceOn = true;
let speaking = false;
const speech = createSpeechController({
    onInterim: () => { brain.notice(); lastUserSpeechAt = performance.now(); },
    onFinal: (text) => { if (!speaking)
        handleUserText(text); },
    onListeningChange: (on) => { $("micBtn").classList.toggle("live", on); },
});
function speak(raw) {
    // stage directions like *yawn*, *beep* or (tiny hop) are shown but not read out loud
    const text = (raw || "").replace(/\*[^*]*\*/g, " ").replace(/\([^)]*\)/g, " ").replace(/\s{2,}/g, " ").trim();
    if (!text || !voiceOn)
        return;
    speaking = true;
    senses.muted = true;
    const prosody = voiceFromBrain(brain.mood());
    const vp = voiceProfile(brain.currentPersonName());
    speech.speak(text, {
        rate: prosody.rate * vp.rate,
        pitch: prosody.pitch * vp.pitch,
        volume: prosody.volume,
        onEnd: () => setTimeout(() => { speaking = false; senses.muted = false; }, 450),
    });
}
const angleDiff = (a, b) => (((a - b) % 360) + 540) % 360 - 180;
async function goTo(x, z, stop, token) {
    const t0 = performance.now();
    Rig.setDancing(false);
    wandering = false;
    navActive++;
    steering.forget();
    eyeLock++; // eyes lead the body while travelling
    const goal = obstacles.find((o) => Math.hypot(o.x - x, o.z - z) < unit)?.id; // never avoid the thing we're walking to
    try {
        while (token === motionToken && performance.now() - t0 < 25000) {
            const p = Rig.getPosition();
            const dx = x - p.x, dz = z - p.z;
            if (Math.hypot(dx, dz) <= stop)
                break;
            const desired = (Math.atan2(dx, dz) * 180) / Math.PI;
            const heading = steering.heading(p, desired, steerObs(), steerOpts(goal)); // sidestep anything in the way
            Rig.setBodyTurn(heading);
            const rel = angleDiff(heading, Rig.getTurnDeg());
            Rig.setEyeAngle(clamp(90 + eyeDir() * rel * 0.7, 35, 145)); // look where he is going before the body gets there
            Rig.setWalking(Math.abs(rel) < 28, 1); // turn first, then walk
            await delay(60);
        }
    }
    finally {
        navActive--;
        eyeLock--;
        Rig.setWalking(false);
        Rig.setEyeAngle(90);
    }
}
async function executeInstructions(instructions) {
    if (!instructions.length)
        return;
    const token = motionToken;
    const usesEyes = instructions.some((i) => i.op === "EXEC" && i.command.startsWith("EYE_"));
    if (usesEyes)
        eyeLock++;
    busyCount++;
    $("bodyState").textContent = "Acting…";
    try {
        for (const i of instructions) {
            if (token !== motionToken)
                break;
            if (i.op === "SLEEP") {
                await delay(i.ms);
                continue;
            }
            const arg = i.arg;
            switch (i.command) {
                case "EYE_CENTER":
                    Rig.setEyeAngle(90);
                    break;
                case "EYE_SET":
                    Rig.setEyeAngle(clamp(Number(arg), 0, 180));
                    break;
                case "EYE_LEFT":
                    Rig.setEyeAngle(clamp(Rig.getEyeAngle() - Number(arg ?? 15), 0, 180));
                    break;
                case "EYE_RIGHT":
                    Rig.setEyeAngle(clamp(Rig.getEyeAngle() + Number(arg ?? 15), 0, 180));
                    break;
                case "TURN_LEFT":
                    Rig.setBodyTurn(Rig.getBodyTurn() - 90);
                    await delay(Number(arg ?? 600));
                    break;
                case "TURN_RIGHT":
                    Rig.setBodyTurn(Rig.getBodyTurn() + 90);
                    await delay(Number(arg ?? 600));
                    break;
                case "FACE":
                    Rig.setBodyTurn(Number(arg));
                    break;
                case "WALK_FORWARD":
                    Rig.setDancing(false);
                    wandering = true;
                    wanderHeading = Rig.getBodyTurn();
                    steering.forget();
                    Rig.setWalking(true, 1);
                    $("bodyState").textContent = "Walking";
                    break;
                case "WALK_STOP":
                    wandering = false;
                    Rig.setWalking(false);
                    Rig.setDancing(false);
                    $("bodyState").textContent = "Idle";
                    break;
                case "DANCE":
                    Rig.setWalking(false);
                    Rig.setDancing(true);
                    $("bodyState").textContent = "Dancing";
                    break;
                case "GOTO": {
                    const [x, z, stop] = String(arg).split(",").map(Number);
                    if ([x, z, stop].every(Number.isFinite)) {
                        $("bodyState").textContent = "Going somewhere";
                        await goTo(x, z, stop, token);
                    }
                    break;
                }
                default: break;
            }
        }
    }
    finally {
        if (usesEyes)
            eyeLock--;
        busyCount--;
        if (busyCount === 0 && !Rig.isWalking())
            $("bodyState").textContent = $("bodyState").textContent === "Dancing" ? "Dancing" : "Idle";
    }
}
// -------------------------------------------------------------- the brain --
const senses = new Senses($("cam"));
let shareFrames = false;
// ---- the emotional brain: a rotating 3D brain with hormones, driven by what happens to him ----
const limbic = new Limbic();
const density = Math.max(0.3, Math.min(1.5, Number(new URLSearchParams(location.search).get("density")) || 0.8)); // ?density=0.5 on a slow machine
const cloud = buildCloud(limbic.sim.nodes, density);
const fibres = buildFibres(cloud, limbic.sim.nodes, Math.round(340 * Math.min(1, density)));
const brainRenderer = new BrainRenderer(limbic.sim, cloud, fibres, { left: $("brainCanvas") });
const brainPanel = new BrainPanel(limbic, brainRenderer);
let limbicScale = 1; // follows the "time speed" control
let lastFrame = performance.now(), panelTimer = 0, lastBrainDraw = 0, brainVisible = true;
// The brain picture is drawn in software, so it only gets drawn when you can see it, and at most ~30 times a second.
// That leaves the CPU free for the 3D robot, which is what felt laggy.
try {
    new IntersectionObserver((es) => { brainVisible = es[es.length - 1].isIntersecting; }).observe($("brainCanvas"));
}
catch { /* old browser: always draw */ }
function brainFrame(now) {
    const turn = brain.takeTurn?.();
    if (turn != null && !stopped)
        setTimeout(() => Rig.setBodyTurn(Rig.getBodyTurn() + turn), 450);
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    for (let left = dt * limbicScale, i = 0; left > 1e-6 && i < 8; i++) {
        const h = Math.min(0.25, left);
        limbic.step(h);
        left -= h;
    }
    const every = brainRenderer.slow ? 66 : 33; // a slow machine gets a lighter brain picture, never a laggy robot
    if (brainVisible && !document.hidden && now - lastBrainDraw >= every) {
        brainRenderer.draw(Math.min(0.12, (now - lastBrainDraw) / 1000), limbic.sim.time);
        lastBrainDraw = now;
    }
    panelTimer += dt;
    if (panelTimer > 0.12) {
        panelTimer = 0;
        brainPanel.update();
    }
    try {
        Rig.setMicro?.(brain.microFrame(dt, Rig.isWalking(), Rig.isDancing?.() ?? false));
    }
    catch { /* the mind is not ready yet */ }
    requestAnimationFrame(brainFrame);
}
requestAnimationFrame(brainFrame);
window.limbic = limbic;
window.visionSenses = () => senses;
window.visionBrain = () => brain; // console: visionBrain().fastForward(900) skips 15 sim-hours; visionBrain().stimulus("scold")     // poke it from the console: limbic.feel("praise")
const brain = new Brain({
    act: (instructions, say) => {
        if (say) {
            showCaption("assistant", say);
            speak(say);
        }
        return executeInstructions(instructions);
    },
    isBusy: () => busyCount > 0,
    getPose: () => ({ ...Rig.getPosition(), headingDeg: Rig.getTurnDeg() }),
    getWorld: () => world,
}, {
    onUpdate: renderMind,
    onEvent: addLog,
    onFeel: (kind, detail) => limbic.feel(kind, detail),
    getChem: () => limbic.state(),
    onOutcome: (reward) => limbic.externalOutcome(reward),
    getLearning: () => limbic.learningState(),
    knownNames: () => senses.knownNames(),
    getSenses: () => {
        // what he sees = the camera + the arena objects in front of him
        const r = senses.read();
        const arena = arenaSights.slice(0, 5).map((s) => ({ label: s.label, side: (s.cx < 0.38 ? "left" : s.cx > 0.62 ? "right" : "center"), near: s.size > 0.12, source: "arena" }));
        return { ...r, seen: [...(r.seen ?? []), ...arena] };
    },
    think: async (req) => askCortex(req, shareFrames && senses.cameraOn ? senses.snapshot() : null),
});
function renderWhy() {
    const el = document.getElementById("why");
    if (!el)
        return;
    const d = brain.lastDecisionInfo();
    if (!d) {
        el.textContent = "";
        return;
    }
    const frag = document.createDocumentFragment();
    const mk = (cls, text) => { const e = document.createElement("div"); e.className = cls; if (text)
        e.textContent = text; return e; };
    const head = mk("why-h");
    const t1 = document.createElement("span");
    t1.textContent = `Why: ${d.action.replace("_", " ")}`;
    const t2 = document.createElement("em");
    t2.textContent = `${d.source === "plan" ? "following a plan" : d.source === "commitment" ? "sticking with it" : "scored & picked"} · ${d.ms < 1 ? d.ms.toFixed(2) : d.ms.toFixed(1)} ms`;
    head.append(t1, t2);
    frag.append(head);
    const bar = (label, frac, val, cls = "") => {
        const r = mk(`row ${cls}`);
        const l = document.createElement("span");
        l.textContent = label;
        const b = mk("bar");
        const i = document.createElement("i");
        i.style.width = `${Math.min(100, Math.abs(frac) * 100)}%`;
        if (frac < 0)
            i.className = "neg";
        b.append(i);
        const v = document.createElement("span");
        v.textContent = val;
        r.append(l, b, v);
        return r;
    };
    const cols = mk("cols");
    const left = mk("col1");
    const right = mk("col2");
    left.append(mk("sub", "Options (chance)"));
    const top = Math.max(0.01, ...d.scores.map((s) => Math.abs(s.u)));
    d.scores.slice(0, 4).forEach((s) => left.append(bar(s.a.replace("_", " "), s.u / top, `${Math.round(s.p * 100)}%`, s.a === d.action ? "win" : "")));
    right.append(mk("sub", "What drove the winner"));
    const pmax = Math.max(0.01, ...d.parts.map((p) => Math.abs(p.v)));
    d.parts.slice(0, 4).forEach((p) => right.append(bar(p.label, p.v / pmax, `${p.v >= 0 ? "+" : ""}${p.v.toFixed(2)}`)));
    cols.append(left, right);
    frag.append(cols);
    frag.append(mk("meta", `temperature ${d.temp.toFixed(2)} · lead ${d.gap >= 0 ? "+" : ""}${d.gap.toFixed(2)} · commits ${d.commitMs ? (d.commitMs / 1000).toFixed(1) + " s" : "n/a"} · words by ${d.speech ? `${d.speech.by} (${d.speech.ms} ms)` : "local mind"}`));
    el.replaceChildren(frag);
}
function renderMind(m) {
    $("mindMood").textContent = m.mood;
    if (!m.clock) {
        $("mindClock").textContent = "";
        $("mindPlan").textContent = "";
        $("mindTraits").textContent = "";
    }
    if (m.clock) {
        const icon = m.asleep ? "💤" : m.phase === "night" ? "🌙" : m.phase === "evening" ? "🌆" : m.phase === "morning" ? "🌅" : "☀️";
        $("mindClock").textContent = `${icon} ${m.clock} · ${m.phase}${m.asleep ? " · asleep" : m.sleepiness > 0.6 ? " · sleepy" : ""}${m.sulking ? " · hurt" : ""}`;
        renderWhy();
        const goal = brain.currentGoal();
        $("mindPlan").textContent = [m.plan ? `Plan: ${m.plan}` : "", goal ? `Goal: ${goal.text} (${Math.round(goal.progress * 100)}%)` : ""].filter(Boolean).join(" · ");
        const t = m.traits;
        if (t)
            $("mindTraits").textContent = `curious ${Math.round(t.curious * 100)} · sociable ${Math.round(t.sociable * 100)} · calm ${Math.round(t.calm * 100)} · bold ${Math.round(t.bold * 100)} · agreeable ${Math.round(t.agreeable * 100)}`;
    }
    Rig.setPosture?.(brain.posture());
    $("mindLast").textContent = m.lastAction;
    $("mindThought").textContent = m.thought;
    const set = (k, v, text) => {
        const b = document.querySelector(`#bars [data-k="${k}"]`);
        if (b)
            b.style.width = Math.round(v * 100) + "%";
        const t = document.querySelector(`#bars [data-v="${k}"]`);
        if (t)
            t.textContent = text;
    };
    for (const k of ["curiosity", "social", "boredom", "arousal"])
        set(k, m[k], String(Math.round(m[k] * 100)));
    set("valence", (m.valence + 1) / 2, (m.valence >= 0 ? "+" : "") + m.valence.toFixed(2));
    const facts = [m.userName ? `knows you as ${m.userName}` : "doesn't know your name yet", `${m.interactions} conversations`, m.favorite ? `favorite: ${m.favorite.replace("_", " ")}` : ""];
    $("facts").textContent = facts.filter(Boolean).join(" · ");
}
function handleUserText(text) {
    lastUserSpeechAt = performance.now();
    showCaption("user", text);
    if (speaking) { // they spoke over him: he stops talking and lets them
        window.speechSynthesis?.cancel();
        speaking = false;
        senses.muted = false;
        showCaption("assistant", brain.interrupted());
    }
    // Teach face / name: "my name is Ada", "this is Bob", "call me Sam", "I am Maya"
    const teach = text.match(/^(?:my name is|i(?:'m| am)|this is|call me|remember me as)\s+([a-zA-Z][\w' -]{0,36})$/i);
    if (teach) {
        void senses.teachPerson(teach[1]).then((r) => {
            if (r.ok) {
                brain.noteSharedKnowledge(`their name is ${teach[1]}`);
                brain.learnPersonName(teach[1].trim());
            }
            showCaption("assistant", r.message);
            speak(r.message);
            addLog("system", `teach: ${r.message}`);
        });
        return;
    }
    if (/^(forget (?:everyone|all names|all people)|clear names)$/i.test(text.trim())) {
        senses.forgetPerson();
        const reply = "okay, I forgot the names I learned";
        showCaption("assistant", reply);
        speak(reply);
        addLog("system", reply);
        return;
    }
    const local = brain.hear(text);
    if (!local)
        return; // AI mode: the cortex will answer
    const stopNow = local.instructions.some((i) => i.op === "EXEC" && i.command === "WALK_STOP") && /stop/i.test(local.reply);
    const pause = stopNow ? 0 : 350 + Math.random() * 450; // a short beat before answering feels natural (but never delay a stop)
    if (stopNow)
        void executeInstructions(local.instructions);
    if (!stopNow)
        brain.markThinking(pause); // he glances away while he "thinks", then looks back at you
    setTimeout(() => {
        showCaption("assistant", local.reply);
        speak(local.reply);
        if (!stopNow)
            void executeInstructions(local.instructions);
    }, pause);
}
// ----------------------------------------------------------------- safety --
function estop() {
    stopped = true;
    motionToken++;
    Rig.setStopped(true);
    Rig.setWalking(false);
    Rig.setDancing(false);
    window.speechSynthesis?.cancel();
    brain.setMode("off");
    setModeUI("off");
    $("bodyState").textContent = "E-STOP";
    $("estop").classList.add("armed");
    $("estop").textContent = "RESUME";
    addLog("system", "EMERGENCY STOP: all motion halted, mind switched off");
}
function resume() { stopped = false; Rig.setStopped(false); $("estop").classList.remove("armed"); $("estop").textContent = "E-STOP"; $("bodyState").textContent = "Idle"; addLog("system", "resumed"); }
$("estop").addEventListener("click", () => ($("estop").classList.contains("armed") ? resume() : estop()));
window.addEventListener("keydown", (e) => { if (e.key === "Escape")
    estop(); });
if (shellDoc) { const ac = new AbortController(); addEventListener("pagehide", () => ac.abort()); shellDoc.addEventListener("keydown", (e) => { if (e.key === "Escape" && shellDoc.querySelector(".bar.mind-on")) estop(); }, { signal: ac.signal }); } // Esc while focus is on the shell's top bar; removed when this page unloads
// Reflexes, 20 Hz, never waiting for any decision maker: arena wall, obstacle steering, no-clipping.
setInterval(() => {
    const p = Rig.getPosition();
    if (!ARENA_INFINITE && Rig.isWalking() && Math.hypot(p.x, p.z) > ARENA * p.unit) {
        motionToken++;
        wandering = false;
        Rig.setWalking(false);
        Rig.setBodyTurn((Math.atan2(-p.x, -p.z) * 180) / Math.PI);
        brain.note("I bumped into the arena wall and stopped");
    }
    if (wandering && navActive === 0 && Rig.isWalking()) { // free walking: steer around whatever is ahead
        const h = steering.heading(p, wanderHeading, steerObs(), steerOpts());
        Rig.setBodyTurn(h);
    }
    const fix = resolveOverlap(p, obstacles, bodyR()); // last line of defense: never stand inside an object
    if (fix) {
        Rig.setPosition(fix.x, fix.z);
        if (wandering) {
            brain.note("I bumped into something and stepped around it");
            brain.hurt(p.x / unit, p.z / unit);
        }
    }
}, 50);
// ------------------------------------------------- saved mind (per account) -
// The human layer's memory is also kept in the database, so it follows the user across
// devices. If nobody is logged in or the server is away, the browser copy is used silently.
function localStateAt() { try {
    return Number(localStorage.getItem("vision.mind.stateAt") ?? 0);
}
catch {
    return 0;
} }
let lastSync = 0;
function syncMind(force = false) {
    const t = Date.now();
    if (!force && t - lastSync < 25000)
        return;
    lastSync = t;
    const st = brain.exportState();
    void saveMindState(st).then((ok) => { if (ok) {
        try {
            localStorage.setItem("vision.mind.stateAt", String(st.savedAt));
        }
        catch { /* ignore */ }
    } });
}
void loadMindState().then((st) => { if (st && brain.importState(st, localStateAt())) {
    try {
        localStorage.setItem("vision.mind.stateAt", String(st.savedAt));
    }
    catch { /* ignore */ }
} });
setInterval(() => syncMind(), 30000);
addEventListener("pagehide", () => { try {
    void saveMindState(brain.exportState(), true);
}
catch { /* ignore */ } });
// day length (real minutes per simulated day); remembered in this browser
const daySel = document.getElementById("dayLen");
if (daySel) {
    try {
        const v = localStorage.getItem("vision.dayMin");
        if (v && [...daySel.options].some((o) => o.value === v))
            daySel.value = v;
    }
    catch { /* ignore */ }
    brain.setDayLength(Number(daySel.value));
    daySel.addEventListener("change", () => { brain.setDayLength(Number(daySel.value)); try {
        localStorage.setItem("vision.dayMin", daySel.value);
    }
    catch { /* ignore */ } });
}
// ---------------------------------------------------------------- controls -
const humanToggle = document.getElementById("humanToggle");
{ // remember the choice; ?human=0 turns the human-like layer off from the start
    const q = new URLSearchParams(location.search).get("human");
    let on = q === null ? true : q !== "0";
    if (q === null) {
        try {
            on = localStorage.getItem("vision.human") !== "0";
        }
        catch { /* default on */ }
    }
    if (humanToggle) {
        humanToggle.checked = on;
        brain.human = on;
        humanToggle.addEventListener("change", () => { brain.setHuman(humanToggle.checked); try {
            localStorage.setItem("vision.human", humanToggle.checked ? "1" : "0");
        }
        catch { /* ignore */ } });
    }
}
function setModeUI(m) { (shellDoc ?? document).querySelectorAll("#modeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === m)); }
(shellDoc ?? document).querySelectorAll("#modeSeg button").forEach((b) => b.addEventListener("click", () => {
    if ($("estop").classList.contains("armed"))
        resume();
    brain.setMode(b.dataset.mode);
    setModeUI(b.dataset.mode);
}));
async function toggleDevice(box, note, on, off) {
    try {
        if (box.checked) {
            await on();
            $(note).textContent = "on";
        }
        else {
            off();
            $(note).textContent = "off";
        }
    }
    catch (e) {
        box.checked = false;
        $(note).textContent = "blocked";
        addLog("system", `permission failed: ${e.message}`);
    }
}
$("tglCam").addEventListener("change", async (e) => {
    const box = e.target;
    if (box.checked)
        $("pip").classList.add("show"); // a display:none video may never decode frames, so show it first
    await toggleDevice(box, "camNote", () => senses.enableCamera(), () => senses.disableCamera());
    $("pip").classList.toggle("show", senses.cameraOn);
    if (senses.cameraOn) {
        // Immediately orient toward the screen / viewer
        wandering = false;
        Rig.setWalking(false);
        Rig.faceViewer?.();
        Rig.setEyeAngle(90);
        gazeAngle = 90;
        gazeGoal = 90;
        $("bodyState").textContent = "Looking";
        addLog("system", "camera on — facing you");
    }
});
$("tglMic").addEventListener("change", (e) => {
    const box = e.target;
    void toggleDevice(box, "micNote", async () => { await senses.enableMic(); speech.startListening(); }, () => { senses.disableMic(); speech.stopListening(); });
});
$("tglVoice").addEventListener("change", (e) => { voiceOn = e.target.checked; if (!voiceOn)
    window.speechSynthesis?.cancel(); });
$("tglShare").addEventListener("change", (e) => {
    shareFrames = e.target.checked;
    addLog("system", shareFrames ? "camera frames will be sent to the AI provider on each thought" : "frames stay on this device (the AI still gets text labels of what I see)");
});
document.querySelectorAll("#speedSeg button").forEach((b) => b.addEventListener("click", () => {
    const n = Number(b.dataset.speed);
    brain.setTimeScale(n);
    limbicScale = n;
    document.querySelectorAll("#speedSeg button").forEach((x) => x.classList.toggle("on", x === b));
}));
$("micBtn").addEventListener("click", () => (speech.isListening() ? speech.stopListening() : speech.startListening()));
$("talkForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("talkText");
    const text = input.value.trim();
    if (text) {
        input.value = "";
        syncSend();
        handleUserText(text);
    }
});
// Send is greyed out until there is something to send; "/" jumps to the box; quick chips send a ready-made line
const sendBtn = $("sendBtn"), talkInput = $("talkText");
function syncSend() { sendBtn.disabled = !talkInput.value.trim(); }
talkInput.addEventListener("input", syncSend);
syncSend();
const keys = $("keys");
const toggleKeys = (on) => { keys.hidden = on === undefined ? !keys.hidden : !on; };
$("helpBtn")?.addEventListener("click", () => toggleKeys(true));
$("keysClose").addEventListener("click", () => toggleKeys(false));
keys.addEventListener("click", (e) => { if (e.target === keys)
    toggleKeys(false); });
window.addEventListener("keydown", (e) => { const t = e.target; if (e.key === "?" && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
    toggleKeys(); });
window.addEventListener("keydown", (e) => { const t = e.target; if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) {
    e.preventDefault();
    talkInput.focus();
} });
document.querySelectorAll("#quick [data-say]").forEach((b) => b.addEventListener("click", () => { const text = b.dataset.say; handleUserText(text); }));
// a little pulse on every stimulus button so you can see it fired
document.querySelectorAll("[data-stim]").forEach((b) => b.addEventListener("click", () => { b.classList.remove("fired"); void b.offsetWidth; b.classList.add("fired"); }));
senses.onEvent = (k) => brain.stimulus(k);
senses.onSight = (ev) => brain.sight(ev);
// The arena is part of what he sees: objects inside his field of view (about 130 degrees, 24 body-sizes) show up as sights.
const worldTracker = new SightTracker(2, 2500);
let arenaSights = [];
setInterval(() => {
    if (brain.mode === "off" || stopped || !world.length)
        return;
    const p = Rig.getPosition();
    const dets = worldDetections({ x: p.x, z: p.z, headingDeg: Rig.getTurnDeg(), unit: p.unit }, world.map((o) => ({ id: o.id, label: arenaLabel(o.id), x: o.x, z: o.z, r: o.r ?? unit * 0.35 })));
    for (const ev of worldTracker.update(dets, performance.now()))
        brain.sight({ ...ev, source: "arena" });
    arenaSights = worldTracker.current();
}, 250);
const flashPip = () => { const el = $("pip"); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); };
senses.book.onNew = (p) => {
    flashPip();
    const msg = `I took your photo and saved it as ${p.name}. Tell me your name ("my name is …") and I'll use it.`;
    showCaption("assistant", msg);
    addLog("system", `photo: new profile "${p.name}"`);
    if (brain.mode !== "off")
        speak(msg);
};
senses.book.onPhoto = (p) => { flashPip(); addLog("system", `photo added to ${p.name}'s profile (${p.photos.length})`); };
senses.onStatus = (t) => { $("pipStatus").textContent = t; addLog("system", `vision: ${t}`); };
// What he sees, drawn over the preview (boxes) and summarised in the Mind panel.
const overlay = $("pipOverlay");
// Camera debug: boxes plus who the face model thinks it is and why (distance vs threshold, the next-best candidates, a fingerprint tag).
let camDebug = false;
function drawFaceDebug(ctx, W, H) {
    const fid = senses.faces, hits = fid.lastDebug;
    ctx.save();
    ctx.font = "10px monospace";
    ctx.lineWidth = 1.5;
    for (const h of hits) {
        const d = h.debug, x = (h.cx - h.box.w / 2) * W, y = (h.cy - h.box.h / 2) * H, w = h.box.w * W, bh = h.box.h * H;
        const col = d.reason === "enrolled" ? "#22c55e" : d.reason === "recent" ? "#facc15" : "#f87171";
        ctx.strokeStyle = col;
        ctx.setLineDash(d.reason === "recent" ? [4, 3] : []);
        ctx.strokeRect(x, y, w, bh);
        ctx.setLineDash([]);
        const lines = [`${h.name}  ${d.reason}`, `d ${Number.isFinite(h.distance) ? h.distance.toFixed(2) : "-"} / thr ${d.threshold.toFixed(2)}${d.slack > 0.005 ? ` (+${d.slack.toFixed(2)} re-id)` : ""}`, `fp ${d.fingerprint}  det ${h.score.toFixed(2)}`, ...d.candidates.slice(0, 3).map((c) => `· ${c.name} ${c.distance.toFixed(2)}`)];
        const ty = Math.min(H - lines.length * 11 - 2, bh + y + 12);
        ctx.fillStyle = "rgba(0,0,0,.65)";
        ctx.fillRect(Math.max(0, x - 1), ty - 10, 168, lines.length * 11 + 3);
        ctx.fillStyle = col;
        lines.forEach((l, i) => ctx.fillText(l, Math.max(2, x + 2), ty + i * 11));
    }
    ctx.fillStyle = "rgba(0,0,0,.65)";
    ctx.fillRect(0, 0, 190, 24);
    ctx.fillStyle = "#e5e7eb";
    ctx.fillText(`model: ${fid.backend || "not loaded"}`, 3, 10);
    ctx.fillText(`faces ${hits.length} · ${Math.round(fid.lastDetectMs)} ms/frame`, 3, 21);
    ctx.restore();
}
// Voice and Live link are separate views of the simulator shell; these two switches open them (the shell shows a "Voice ×" chip in the top bar to come back).
{
    const shell = (() => { try {
        return window.parent !== window ? window.parent.VisionShell : null;
    }
    catch {
        return null;
    } })();
    for (const [id, view] of [["tglVoicePage", "voice"], ["tglLive", "live"]]) {
        const el = document.getElementById(id), tile = el?.closest("label");
        if (!el || !tile)
            continue;
        if (!shell) {
            tile.style.display = "none";
            continue;
        } // opened on its own, not inside the shell
        el.addEventListener("change", () => { if (el.checked)
            shell.open(view); });
    }
}
$("tglCamDbg").addEventListener("change", (e) => { camDebug = e.target.checked; $("camDbgNote").textContent = camDebug ? "on" : "off"; });
{
  const tgl = $("faceModelToggle"), nm = $("faceModelName"), ids = FaceId.backends().filter((b) => b !== "scripted");
  const label = (id) => (id === "faceapi" ? "face-api" : id);
  // off = the first model (face-api, the default), on = the second one
  const show = () => { nm.textContent = label(senses.faces.backendId); tgl.checked = ids.indexOf(senses.faces.backendId) > 0; };
  show(); tgl.disabled = ids.length < 2;
  if (ids.length < 2) $("faceModelLbl").title = "Only face-api is built in. More models can be added in src/faceBackend.ts (see docs/face-pipeline.md).";
  tgl.addEventListener("change", async () => {
    const want = ids[tgl.checked ? 1 : 0] ?? ids[0];
    nm.textContent = label(want);
    toast(`Face model: ${label(want)}${want === ids[0] ? " (default)" : ""}`, "good");
    const prev = senses.faces.backendId;
    const ok = await senses.faces.setBackend(want);
    $("pipStatus").textContent = ok ? `face model: ${senses.faces.backend}` : `face model "${want}" could not start`;
    if (!ok) { toast(`Face model "${label(want)}" could not start; staying on ${label(prev)}`, "warn"); await senses.faces.setBackend(prev); show(); }
  });
}
setInterval(() => {
    const ctx = overlay.getContext("2d");
    if (!ctx)
        return;
    const video = $("cam");
    const ow = overlay.clientWidth || 240, oh = overlay.clientHeight || 180;
    if (overlay.width !== ow || overlay.height !== oh) {
        overlay.width = ow;
        overlay.height = oh;
    }
    else
        ctx.clearRect(0, 0, ow, oh);
    const arenaNames = arenaSights.map((s) => `${s.label} (${s.cx < 0.38 ? "left" : s.cx > 0.62 ? "right" : "center"})`);
    if (!senses.cameraOn) {
        $("seeing").textContent = arenaNames.length ? `In the arena I see: ${arenaNames.join(", ")} · camera off` : "camera off · nothing in front of me";
        return;
    }
    $("pipMotion").style.width = Math.round(senses.motion * 100) + "%";
    ctx.lineWidth = 2;
    ctx.font = "11px monospace";
    if (camDebug)
        drawFaceDebug(ctx, overlay.width, overlay.height);
    for (const s of senses.sights) {
        const x = (s.cx - s.w / 2) * overlay.width, y = (s.cy - s.h / 2) * overlay.height, w = s.w * overlay.width, h = s.h * overlay.height;
        const color = s.label === "person" || s.label === "someone" ? "#22c55e" : "#38bdf8";
        ctx.strokeStyle = color;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = color;
        ctx.fillText(s.label, x + 3, Math.max(11, y - 3));
    }
    const names = senses.sights.map((s) => `${s.color && s.label !== "person" ? s.color + " " : ""}${s.label} (${s.cx < 0.38 ? "left" : s.cx > 0.62 ? "right" : "center"})`);
    const tier = senses.mode === "model" ? "naming objects" : senses.mode === "loading" ? "loading object model…" : "pixel mode: can see movement, can't name things";
    const cam = names.length ? `Camera: ${names.join(", ")}` : (video.videoWidth ? `camera: nothing yet · ${tier}` : "waiting for camera frames…");
    $("seeing").textContent = arenaNames.length ? `${cam} · Arena: ${arenaNames.join(", ")}` : cam;
}, 200);
// Gaze + body orientation toward the camera/user.
// Visual servoing on pixel error: turn until the person is centered (no accumulating yaw bug).
let gazeAngle = 90, gazeGoal = 90, nextSaccade = 0;
const glanceAtToy = () => {
    const p = Rig.getPosition(), toys = world.filter((o) => o.kind === "toy");
    if (!toys.length)
        return null;
    const o = toys[Math.floor(Math.random() * toys.length)];
    const rel = angleDiff((Math.atan2(o.x - p.x, o.z - p.z) * 180) / Math.PI, Rig.getTurnDeg());
    return clamp(90 + eyeDir() * clamp(rel, -50, 50) * 0.8, 35, 145);
};
setInterval(() => {
    if (brain.mode === "off" || stopped)
        return;
    const now = performance.now();
    const camOn = senses.cameraOn;
    const target = camOn ? senses.gazeTarget() : null;
    const person = camOn && (senses.personPresent || !!target);
    // Someone on camera → stop free wandering so he can face you
    if (person && wandering && navActive === 0) {
        wandering = false;
        Rig.setWalking(false);
        $("bodyState").textContent = "Looking";
    }
    if (eyeLock > 0) {
        // Scripted action owns the eyes this frame
    }
    else if (now - lastUserSpeechAt < 4000) {
        gazeGoal = 90; // eye contact while you talk
    }
    else if (target) {
        const err = target.cx - 0.5; // >0 → person on the right of the preview
        gazeGoal = clamp(90 + eyeDir() * err * 2 * 60, 20, 160);
    }
    else if (camOn) {
        gazeGoal = 90; // camera on, no target yet → look straight at the lens
    }
    else if (now > nextSaccade) {
        const m = brain.mood();
        const spread = Rig.isWalking() ? 8 : m === "curious" || m === "bored" ? 38 : m === "attentive" ? 14 : 22;
        gazeGoal = Math.random() < 0.18 ? glanceAtToy() ?? 90 : 90 + (Math.random() * 2 - 1) * spread;
        nextSaccade = now + 1200 + Math.random() * 3200;
    }
    if (eyeLock <= 0) {
        gazeAngle += (gazeGoal - gazeAngle) * 0.35;
        Rig.setEyeAngle(clamp(gazeAngle, 0, 180));
    }
    // Face the screen / viewer when camera is on; fine-tune with pixel error
    if (navActive === 0 && !Rig.isWalking() && camOn) {
        // Base: orient body toward the 3D view camera (the user looking at the page)
        const faceDeg = typeof Rig.faceViewer === "function" ? (Rig.getViewThetaDeg?.() ?? 0) : 0;
        const err = target ? (target.cx - 0.5) : 0;
        // Absolute heading = face screen + small offset from where the person sits in frame
        const desired = faceDeg + eyeDir() * err * 40;
        const cur = Rig.getBodyTurn();
        const diff = angleDiff(desired, cur);
        if (Math.abs(diff) > 1)
            Rig.setBodyTurn(cur + clamp(diff, -8, 8));
    }
}, 50);
document.querySelectorAll("[data-stim]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.stim;
    if (k === "teleport") {
        const a = Math.random() * 6.28;
        Rig.setPosition(Math.sin(a) * 34 * unit, Math.cos(a) * 34 * unit);
        brain.stimulus("teleport");
    }
    else if (k === "skip") {
        brain.fastForward(60);
        for (let i = 0; i < 240; i++)
            limbic.step(0.25);
    }
    else if (k === "teach") {
        const name = prompt("What should I call you? (face the camera, good light)");
        if (name) {
            void senses.teachPerson(name).then((r) => {
                if (r.ok)
                    brain.learnPersonName(name.trim());
                showCaption("assistant", r.message);
                speak(r.message);
                addLog("system", `teach: ${r.message}`);
            });
        }
    }
    else if (k === "forget") {
        const who = brain.currentPersonName();
        if (confirm(`Make Vision forget everything he remembers about ${who}? (Their face stays taught.)`)) {
            const had = brain.forgetPerson();
            const msg = had ? `Okay. I've forgotten ${who}.` : `I don't have much about ${who} to forget.`;
            showCaption("assistant", msg);
            speak(msg);
            syncMind(true);
        }
    }
    else if (k === "reset") {
        try {
            localStorage.removeItem("vision.mind.v3");
            localStorage.removeItem("vision.brain.learn.v1");
            localStorage.removeItem("vision.knownPeople.v1");
            localStorage.removeItem("vision.faceEmbeddings.v1");
            localStorage.removeItem("vision.mind.stateAt");
        }
        catch { /* ignore */ }
        void deleteMindState();
        location.reload();
    }
    else if (k === "gift") {
        const id = `toy_${Math.random().toString(36).slice(2, 5)}`;
        const p = Rig.getPosition();
        const a = Math.random() * 6.28;
        const o = { id, kind: "toy", x: p.x + Math.sin(a) * 8 * unit, z: p.z + Math.cos(a) * 8 * unit, color: "#f59e0b" };
        world.push(o);
        obstacles.push({ id, x: o.x, z: o.z, r: unit * 0.35 });
        Rig.addProp({ id, kind: "toy", x: o.x, z: o.z, color: 0xf59e0b, radius: unit });
        brain.stimulus("gift");
    }
    else if (k === "loud_noise")
        brain.stimulus("loud_noise", Math.random() * 360 - 180); // a noise from a random direction: he turns toward it
    else
        brain.stimulus(k);
}));
// -------------------------------------------------------------------- boot --
fetchHealth().then((h) => {
    const b = $("llmBadge"), t = b.querySelector("span");
    if (!h) {
        t.textContent = "server unreachable";
        b.classList.add("warn");
        return;
    }
    t.textContent = h.llm.configured ? `LLM: ${h.llm.provider} · ${h.llm.model}` : "AI mind: no API key, falls back to local";
    b.classList.add(h.llm.configured ? "good" : "warn");
});
// ------------------------------------------------- clock, battery, charger, zones (simulation only)
const stagePanel = document.querySelector(".stage-panel");
// Weather and sky drawing: stars, clouds, rain, fog, lightning on the #rain canvas (src/weatherfx.ts). To switch it all off: delete this block, the canvas in index.html, and pass `weather: false` to `new Brain(...)`.
const fx = new WeatherFx($("rain"));
let lastRain = performance.now(), rainWasActive = false;
function rainLoop(t) {
    requestAnimationFrame(rainLoop);
    if (document.hidden || t - lastRain < 33)
        return; // 30 fps is plenty for weather
    const dt = Math.min(0.1, (t - lastRain) / 1000);
    lastRain = t;
    if (fx.active) {
        fx.frame(dt);
        rainWasActive = true;
    }
    else if (rainWasActive) {
        fx.clear();
        rainWasActive = false;
    } // clear daytime sky: nothing to draw
}
requestAnimationFrame(rainLoop);
let chargeTrip = -1e9;
const MOOD_HUE = { happy: 45, excited: 30, content: 165, calm: 175, curious: 195, neutral: 265, alert: 25, sad: 220, fearful: 285, afraid: 285, angry: 0, hurt: 350, pain: 10, sleepy: 235, bored: 250 };
setInterval(() => {
    // sky colour: the page behind the 3D view is a gradient that follows the time of day and weather; the 3D floor fades into its bottom colour at the horizon
    const look = brain.skyView();
    fx.set(brain.sky(), daylight(brain.hour()));
    // The horizon colour is the sky's bottom colour pulled toward the dark floor, so the floor's edge and the sky meet in ONE plain colour (no pale haze band, no black strip, no visible line).
    stagePanel.style.background = `linear-gradient(to bottom, ${look.top} 0%, ${look.bottom} var(--horizon, 40%), ${look.bottom} 100%)`;
    stagePanel.style.setProperty("--dim", String(look.dim));
    Rig.setSky?.(look.bottom);
    const hr = brain.hour(), hh = Math.floor(hr), mm = Math.floor((hr - hh) * 60);
    const hud = $("hud"), bat = brain.batteryLevel();
    const night = hr < 6 || hr >= 20, icon = look.label === "clear" ? (night ? "☾" : "☀") : look.label === "cloudy" ? "☁" : look.label === "rain" ? "☂" : look.label === "storm" ? "⚡" : "≋";
    const mood = String(brain.mood()).toLowerCase(), hue = MOOD_HUE[mood] ?? 265;
    stagePanel.style.setProperty("--mh", String(hue));
    document.documentElement.style.setProperty("--mh", String(hue));
    hud.innerHTML = `<span class="mood" title="how he feels"><i style="background:hsl(${hue} 80% 62%)"></i>${mood}</span><span title="simulated time">${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}</span><span title="weather">${icon} ${look.label}</span><span class="bat ${bat < 0.25 ? "low" : ""}" title="battery ${Math.round(bat * 100)}%" role="img" aria-label="battery ${Math.round(bat * 100)} percent"><b><i style="width:${Math.round(bat * 100)}%"></i></b></span>`;
    const p = Rig.getPosition();
    const onCh = !!chargerPos && Math.hypot(p.x - chargerPos.x, p.z - chargerPos.z) < unit * 3.2;
    brain.power(onCh);
    brain.setCharger(!!chargerPos);
    const zt = zones.find((q) => Math.hypot(q.x * unit - p.x, q.z * unit - p.z) < q.r * unit)?.temp ?? null;
    brain.setTemperature(zt);
    if (brain.wantsCharge() && chargerPos && !stopped && performance.now() - chargeTrip > (Rig.isWalking() ? 30000 : 6000) && !onCh) {
        chargeTrip = performance.now();
        brain.note("my battery is low, heading to the charger");
        void executeInstructions([{ op: "EXEC", command: "GOTO", arg: `${chargerPos.x},${chargerPos.z},${2 * unit}` }]);
    }
}, 500);
// ------------------------------------------------- the Lab panel (timeline, personality, scenarios, story, scenery)
initLab({
    brain, runScenario, SCENARIOS, PERSONALITIES,
    makeHeadless: () => {
        const B = Brain;
        let now = 1_000_000;
        const key = "vision.lab." + Math.random().toString(36).slice(2);
        const body = { act: async () => { }, isBusy: () => false, getPose: () => ({ x: 0, z: 0, unit: 1, headingDeg: 0 }), getWorld: () => [] };
        const b = new B(body, { now: () => now, storageKey: key, getSenses: () => ({ motion: 0, brightness: 0.5, loudness: 0, camera: false, mic: false, personPresent: false }) });
        return { brain: b, advance: (ms) => { now += ms; }, done: () => { try {
                for (const k of Object.keys(localStorage))
                    if (k.startsWith(key))
                        localStorage.removeItem(k);
            }
            catch { /* none */ } } };
    },
    scenery: { pose: () => { const p = Rig.getPosition(); return { x: p.x / unit, z: p.z / unit, heading: Rig.getTurnDeg() }; }, charger: () => (chargerPos ? { x: chargerPos.x / unit, z: chargerPos.z / unit } : null), list: () => sceneryList.map((o) => ({ ...o })), add: async (o) => { await addScenery(o); }, remove: removeScenery, move: moveScenery, addZone: (z) => addZone(z), removeZone, clear: clearLayout, reset: resetLayout, zones: () => zones.map((z) => ({ ...z })), unit: () => unit },
    addLog: (m) => addLog("system", m),
    people: {
        list: () => senses.book.profiles,
        snap: (name) => senses.snapNow(name),
        rename: (id, to) => { const old = senses.book.byId(id)?.name; const ok = senses.book.rename(id, to); if (ok && old) {
            senses.faces.rename(old, to);
            brain.learnPersonName(to);
        } return ok; },
        remove: (id) => { const p = senses.book.byId(id); if (p) {
            senses.book.remove(id);
            senses.faces.forget(p.name);
        } },
        clear: () => senses.forgetPerson(),
        onChange: (fn) => { senses.book.onChange = fn; },
        cameraOn: () => senses.cameraOn,
    },
    ai: {
        health: () => fetchHealth(),
        verdict: aiVerdict,
        probe: async (prompt) => {
            const t0 = performance.now();
            try {
                const r = await fetch("/api/simulation/voice/chat", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: prompt, history: [] }) });
                const ms = Math.round(performance.now() - t0);
                const j = r.ok ? await r.json().catch(() => ({})) : {};
                return { prompt, ms, ok: r.ok, status: r.status, reply: String(j.reply ?? ""), source: j.source, model: j.model };
            }
            catch (e) {
                return { prompt, ms: Math.round(performance.now() - t0), ok: false, status: "network error", reply: "" };
            }
        },
    },
});
Rig.ready.then(async () => { placeProps(); await loadScenery(); brain.start(); }).catch(() => addLog("system", "3D model failed to load"));
// ---- Learning log and tuned weights (Lab > Mind). Tuning itself happens offline: server/scripts/tune-mind.ts.
{
    const KEY = "vision.mindWeights.v1", st = document.getElementById("mlStatus");
    const say = (t) => { if (st)
        st.textContent = t; };
    const names = () => Object.keys(brain.getWeights()).length;
    const status = () => { const c = brain.mindLog.count(); say(`${c.withReward} choices logged (${c.scored} usable for tuning). Weights: ${names() ? names() + " tuned parts loaded" : "none, original mind"}.`); };
    try {
        const w = localStorage.getItem(KEY);
        if (w)
            brain.setWeights(JSON.parse(w));
    }
    catch { /* none saved */ }
    brain.mindLog.load();
    const apply = (w) => { brain.setWeights(w); try {
        w ? localStorage.setItem(KEY, JSON.stringify(w)) : localStorage.removeItem(KEY);
    }
    catch { /* storage blocked: applies for this visit only */ } status(); };
    document.getElementById("mlExport")?.addEventListener("click", () => {
        const c = brain.mindLog.count();
        if (!c.withReward)
            return say("Nothing logged yet. Let him run for a while first.");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([brain.mindLog.toJSONL()], { type: "application/x-ndjson" }));
        a.download = `vision-mind-log-${Date.now()}.jsonl`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        status();
    });
    const file = document.getElementById("mlFile");
    document.getElementById("mlLoad")?.addEventListener("click", () => file?.click());
    file?.addEventListener("change", async () => {
        const f = file.files?.[0];
        if (!f)
            return;
        try {
            const w = JSON.parse(await f.text());
            if (!w || typeof w !== "object" || Array.isArray(w) || !Object.values(w).every((v) => typeof v === "number"))
                throw new Error("not a weights file");
            apply(w);
        }
        catch {
            say("That file is not a weights.json from the tuner.");
        }
        file.value = "";
    });
    document.getElementById("mlReset")?.addEventListener("click", () => apply(null));
    document.getElementById("mlClear")?.addEventListener("click", () => { brain.mindLog.clear(); status(); });
    status();
    setInterval(status, 5000);
}
// ---- Optional learned terms (steps 3 and 4). Both are off until switched on here; nothing above depends on them.
{
    const RK = "vision.mindResidual.v1", NK = "vision.mindNet.v1", st = document.getElementById("mlStatus");
    const note = (t) => { if (st)
        st.textContent = t; };
    const resCb = document.getElementById("mlResidual"), netCb = document.getElementById("mlNetOn"), netFile = document.getElementById("mlNetFile");
    try {
        const r = localStorage.getItem(RK);
        if (r)
            brain.residual.load(JSON.parse(r));
    }
    catch { /* none */ }
    try {
        const n = localStorage.getItem(NK);
        if (n && brain.netPolicy.load(JSON.parse(n))) {
            if (netCb)
                netCb.disabled = false;
        }
    }
    catch { /* none */ }
    resCb?.addEventListener("change", () => { brain.residual.enabled = resCb.checked; note(resCb.checked ? "Online residual on: it starts small and learns from outcomes while he runs." : "Online residual off."); });
    setInterval(() => { if (brain.residual.enabled) {
        try {
            localStorage.setItem(RK, JSON.stringify(brain.residual.toJSON()));
        }
        catch { /* storage blocked */ }
    } }, 15000);
    document.getElementById("mlResidualReset")?.addEventListener("click", () => { brain.residual.reset(); try {
        localStorage.removeItem(RK);
    }
    catch { /* ignore */ } note("Online residual reset to zero."); });
    document.getElementById("mlNetLoad")?.addEventListener("click", () => netFile?.click());
    netFile?.addEventListener("change", async () => {
        const f = netFile.files?.[0];
        if (!f)
            return;
        try {
            const j = JSON.parse(await f.text());
            if (!brain.netPolicy.load(j))
                throw new Error("bad net");
            try {
                localStorage.setItem(NK, JSON.stringify(j));
            }
            catch { /* ignore */ }
            if (netCb) {
                netCb.disabled = false;
                netCb.checked = true;
            }
            brain.netPolicy.enabled = true;
            note("Net loaded and switched on.");
        }
        catch {
            note("That file is not a net.json from train-net.ts.");
        }
        netFile.value = "";
    });
    netCb?.addEventListener("change", () => { brain.netPolicy.enabled = netCb.checked; note(netCb.checked ? "Net on." : "Net off."); });
    document.getElementById("mlNetClear")?.addEventListener("click", () => { brain.netPolicy.load(null); brain.netPolicy.enabled = false; if (netCb) {
        netCb.checked = false;
        netCb.disabled = true;
    } try {
        localStorage.removeItem(NK);
    }
    catch { /* ignore */ } note("Net removed."); });
}
