/**
 * Vision's mind. Two layers share one body of state:
 *
 *   drives + emotion + 3-tier memory   (always running, local, free)
 *   decision maker                     ALWAYS the local utility AI + learning,
 *                                      strongly driven by the emotional brain state
 *                                      (hormones, instinct, learned values).
 *
 *   "ai" mode                          LLM is used ONLY for natural language
 *                                      generation (what he says). It never
 *                                      chooses actions. The simulated brain
 *                                      remains the source of intelligence.
 *
 * Reflexes (startle, arena wall) never wait for anything.
 * Honest framing: this is a simulated mind. It is autonomous, not conscious.
 */
import { MindLog, roundRec } from "./mindlog.js";
import { OnlineResidual, NetPolicy } from "./residual.js";
import { arenaLabel } from "./vision.js";
import { respond, learnFrom, refusal, pickFresh, SIGHT_REACTS } from "./dialogue.js";
import { CHEMS } from "./brainsim/chem.js";
import { Habits, JokeBook, Tricks, Routine, Battery, Pain, History, Presence, GiftLog, skyAt, skyLook, skyEffect, tempEffect, dream as makeDream, recallRelevant, explainDecision, tellDay, groupGreeting, tornLine, LAUGH_RX } from "./life.js";
import { Micro, TopicMemory, MoodLog, curiosityQuestion, readAnswer, isStatement, backchannel, hedge, applyQuirk, pickQuirk, callback, explainMood, dayTone, reunion, OWN_SORRY, GRUMPY_LINES, soundLine, JEALOUS_RX, jealousLine, jealousSight, INTERRUPTED, trailOff, fadeFacts, forgotQuestion, checkMilestones, MILESTONES, Overload, SPACE_ASK, SPACE_REPLIES, SPACE_END, SORRY_RX, } from "./natural.js";
import { BodyClock, Planner, Relationships, DEFAULT_BIG5, APOLOGY, CURT_LINES, daydream, driftTraits, goalLine, goalProgress, newGoal, carryOver, empathy, postureFor, styleSpeech, traitBias } from "./human.js";
const ACTIONS = ["wander", "look_around", "dance", "rest", "call_out", "murmur", "go_home", "play", "watch"];
export const ARENA = 40; // used only when ARENA_INFINITE is false
export const ARENA_INFINITE = true; // no wall, no purple ring, open world
const CELL = 8;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pct = (v) => Math.round(v * 100) + "%";
const norm180 = (a) => (((a % 360) + 540) % 360) - 180;
const exec = (command, arg) => (arg === undefined ? { op: "EXEC", command } : { op: "EXEC", command, arg });
const sleep = (ms) => ({ op: "SLEEP", ms: Math.round(ms) });
const stopAll = () => exec("WALK_STOP");
const cleanSay = (s) => (typeof s === "string" ? s.replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, 240) : "");
/** Tiers: working (last 7), episodic (decays), long-term (consolidated, persisted). */
export class Memory {
    key;
    now;
    working = [];
    episodes = [];
    long = { interactions: 0, firstMetAt: 0, lastSeenAt: 0, actionValue: {}, cells: [], lessons: [], ctxValue: {}, seen: {}, traits: { playful: 0.5, shy: 0.5 }, facts: {}, big5: { ...DEFAULT_BIG5 } };
    get clockKey() { return this.key + ".clock"; }
    constructor(key, now) {
        this.key = key;
        this.now = now;
        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                const d = JSON.parse(raw);
                this.long = { ...this.long, ...d.long, traits: { ...this.long.traits, ...(d.long?.traits ?? {}) }, big5: { ...DEFAULT_BIG5, ...(d.long?.big5 ?? {}) } };
                this.episodes = d.episodes ?? [];
            }
        }
        catch { /* storage unavailable */ }
    }
    remember(kind, detail, valence = 0, salience = 0.3) {
        this.working.push(`${kind}: ${detail}`);
        if (this.working.length > 7)
            this.working.shift();
        this.episodes.push({ t: this.now(), kind, detail, valence, salience });
        if (this.episodes.length > 200)
            this.episodes.shift();
    }
    consolidate() {
        for (const e of this.episodes) {
            e.salience *= 0.97;
            if (e.salience > 0.55 && !e.promoted) {
                e.promoted = true;
                this.long.lessons.push(`${e.kind}: ${e.detail}`);
                if (this.long.lessons.length > 20)
                    this.long.lessons.shift();
            }
        }
        this.episodes = this.episodes.filter((e) => e.salience > 0.08);
        const best = Object.entries(this.long.actionValue).sort((a, b) => b[1] - a[1])[0];
        this.long.favorite = best && best[1] > 0.05 ? best[0] : undefined;
        this.save();
    }
    save() {
        try {
            localStorage.setItem(this.key, JSON.stringify({ long: this.long, episodes: this.episodes.slice(-50) }));
        }
        catch { /* ignore */ }
    }
}
const MURMURS = {
    happy: ["I feel good right now.", "Everything feels a bit brighter.", "I could stay like this."],
    afraid: ["My heart is racing. What was that?", "I don't like this. I'm keeping watch.", "Something feels off…"],
    angry: ["That wasn't nice.", "I'm still a little upset.", "I need a moment."],
    sad: ["I feel a bit low.", "It's a grey kind of moment.", "I wish someone were here."],
    disgusted: ["Ugh. Something's off.", "I'd rather not."],
    hurt: ["Ow. That still stings.", "I'm being careful now."],
    sleepy: ["Mm. Heavy eyelids.", "A little rest would help."],
    excited: ["I feel like moving!", "Everything feels interesting right now.", "What's next?"],
    startled: ["Whoa, what was that?", "That got me."],
    lonely: ["It's quiet. I wonder where you are.", "Is anyone there?", "Company would be nice."],
    bored: ["Nothing is happening. I'll find something to do.", "Time to shake things up.", "I need a little spark."],
    curious: ["I wonder what's over there.", "I haven't seen that corner yet.", "Something new would be good."],
    content: ["Nice and calm.", "This is a good spot.", "I'm okay just being here."],
    calm: ["Just thinking.", "All quiet.", "Soft moment."],
};
export class Brain {
    body;
    opts;
    mode = "local";
    curiosity = 0.5;
    social = 0.4;
    boredom = 0.2;
    valence = 0.1;
    arousal = 0.3;
    thought = "Just woke up.";
    lastAction = "";
    recent = [];
    journal = [];
    notable = [];
    toyCooldown = new Map();
    lastUserAt = -1e12;
    lastDecisionAt;
    nextGap = 3000;
    lastSpokeAt = 0;
    habit = {}; // habituation: repeated stimuli matter less
    personSince = 0;
    lastPersonAt = -1e12;
    sightSaid = new Map(); // per-label comment cooldown
    spoken = []; // last things he said, to avoid repeating himself
    convo = [];
    lastTopic;
    tonicAt = {};
    partsOut = null;
    /** Decision log for offline tuning (mindlog.ts / tuner.ts) and the tuned score weights (all 1 by default). */
    mindLog = new MindLog();
    mindW = {};
    useW = true;
    pendingTick = null;
    /** Optional learned terms, both OFF by default (see residual.ts): a small online residual (step 3) and a net trained offline (step 4). */
    residual = new OnlineResidual();
    netPolicy = new NetPolicy();
    learnedState = null; // state vector cached per decision so score() stays cheap
    learnedAt = -1;
    setWeights(w) { this.mindW = {}; for (const [k, v] of Object.entries(w ?? {}))
        if (Number.isFinite(v))
            this.mindW[k] = Math.min(3, Math.max(0, v)); }
    getWeights() { return { ...this.mindW }; }
    stateVec() {
        const sl = this.human ? this.clock.sleepiness() : 0;
        return roundRec({ curiosity: this.curiosity, social: this.social, boredom: this.boredom, valence: this.valence, arousal: this.arousal, fatigue: this.fatigue, present: this.personPresent() ? 1 : 0, sleepiness: sl, hour: this.human ? this.clock.hour : 0 });
    }
    dsrc = "scored";
    dtemp = 0;
    dcommit = 0;
    lastDecision = null;
    trace = ""; // why the last local decision was made
    acting = 0;
    thinking = false;
    urgent = false;
    pendingHeard = null;
    ticks = 0;
    weatherOn = true;
    timer = null;
    now;
    scale;
    memory;
    // ----- human-like layer (human.ts)
    human;
    clock;
    planner = new Planner();
    rel;
    lastReflectAt = 0;
    /** Leftover mood from yesterday; fades over a few simulated hours. */
    moodCarry = 0;
    // natural behaviour (see natural.ts)
    micro = new Micro(() => Math.random());
    topicMem = new TopicMemory();
    moodLog = new MoodLog();
    dayToneV = 0;
    dayCause = null;
    awaiting = null;
    lastQuestionAt = -1e12;
    grumpyCount = 0;
    thinkingUntil = 0;
    /** The recognised person in front of the camera right now (by face), if any. */
    currentPerson = null;
    currentPersonAt = 0;
    lastInsight;
    stepSay;
    stepAlts;
    planNote = "";
    clockSavedAt = 0;
    /** Active goals (human-like hierarchical control). */
    goals = [];
    /** Fatigue (0..1) — builds with activity, recovers with rest. Homeostatic cycle. */
    fatigue = 0.1;
    overload = new Overload();
    habits = new Habits();
    jokes = new JokeBook();
    tricks = new Tricks();
    routine = new Routine();
    battery = new Battery();
    pain = new Pain();
    history = new History();
    presence = new Presence();
    gifts = new GiftLog();
    dayIndex = 0;
    lastHour = -1;
    skyNow = "clear";
    announcedDay = -1;
    lastDream = "";
    onCharger = false;
    hasCharger = false;
    lowWarnAt = 0;
    fullSaid = true;
    evLog = [];
    lastDid = "";
    lastDidAt = 0;
    curEffect = "idle";
    curEffectAt = 0;
    tempNow = null;
    tempSaidAt = 0;
    hurtAt = 0;
    objPos = new Map();
    objSaid = new Map();
    inspectQ = [];
    spaceUntil = 0;
    turnReq = null;
    /** Simple self-model: how he usually feels / acts in situations */
    selfModel = { typicalMood: 0.1, playfulBias: 0.5, socialBattery: 0.7 };
    /** Current intention — stick with a chosen action for a few cycles (coherence) */
    intention = null;
    /** Object preferences learned from play (id → value) */
    objectPref = {};
    /** Model of the human (theory of mind). */
    userModel = {
        friendliness: 0.2, attention: 0.3, predictability: 0.5, lastAct: "", trust: 0.4,
        mood: 0.1, inferredGoal: "unknown", sharedKnowledge: [], recentActs: [], patience: 0.7,
    };
    /** Adaptive exploration temperature (meta-learning). */
    exploreTemp = 0.18;
    constructor(body, opts = {}) {
        this.body = body;
        this.opts = opts;
        this.now = opts.now ?? (() => Date.now());
        this.scale = opts.timeScale ?? 1;
        this.weatherOn = opts.weather ?? true;
        this.setWeights(opts.weights);
        this.memory = new Memory(opts.storageKey ?? "vision.mind.v3", this.now);
        this.lastDecisionAt = this.now();
        this.human = opts.human !== false;
        let saved = {};
        try {
            saved = JSON.parse(localStorage.getItem(this.memory.clockKey) ?? "{}");
        }
        catch { /* none */ }
        this.clock = new BodyClock(opts.minutesPerSec ?? 1, saved);
        if (saved.at)
            this.clock.advance(Math.min(1200, Math.max(0, (this.now() - saved.at) / 1000))); // time passes while the page is closed (up to ~20 sim-hours)
        this.rel = new Relationships(`${this.memory.clockKey}.rel`, typeof localStorage !== "undefined" ? localStorage : undefined);
        this.topicMem = new TopicMemory(this.memory.long.topics ?? []);
        this.loadLife(this.memory.long.life);
    }
    // ----- lifecycle
    start() {
        if (this.timer)
            return;
        const m = this.memory.long;
        const awayMs = m.lastSeenAt ? this.now() - m.lastSeenAt : 0;
        const awayMin = awayMs / 60000;
        let hello;
        if (!m.interactions) {
            hello = "Hello? I just woke up.";
            this.thought = "First time awake. Looking around.";
        }
        else if (m.userName && awayMin > 30) {
            hello = `Welcome back, ${m.userName}. I missed this.`;
            this.thought = "It's been a while. I still remember them.";
        }
        else if (m.userName) {
            hello = pick([`Hey ${m.userName}.`, `Hi ${m.userName}, I'm here.`, `Good to see you, ${m.userName}.`]);
            this.thought = "I remember being here before.";
        }
        else if (awayMin > 30) {
            hello = "You're back. I was waiting.";
            this.thought = "Someone returned after a long stretch alone.";
        }
        else {
            hello = "Good to see you again.";
            this.thought = "I remember being here before.";
        }
        this.event("system", this.thought);
        void this.say(hello);
        m.lastSeenAt = this.now();
        this.timer = setInterval(() => this.tick(), 1000);
    }
    stop() { if (this.timer)
        clearInterval(this.timer); this.timer = null; }
    setMode(m) { this.mode = m; this.event("system", `mind mode: ${m}`); this.emit(); }
    setTimeScale(n) { this.scale = Math.max(1, n); }
    /** Skip time forward (drives only, no decisions). */
    fastForward(seconds) { this.drift(seconds); if (this.human) {
        this.clock.advance(seconds);
        this.rel.decay(seconds);
    } this.event("system", `${seconds}s pass...`); this.emit(); }
    /** Add a note the AI cortex will see on its next think. */
    note(text) { this.notable.push(text); if (this.notable.length > 8)
        this.notable.shift(); this.event("percept", text); }
    // ----- perception
    notice() { this.lastUserAt = this.now(); this.arousal = clamp(this.arousal + 0.03); }
    /** Sandbox / sensor stimuli. Appraise immediately, react by reflex, let the cortex think about it. */
    stimulus(kind, bearing) {
        const f = ["motion", "loud_noise", "dark", "bright", "poke"].includes(kind) ? this.habituate(kind) : 1; // 1 = fresh, lower = used to it
        const v0 = this.valence;
        const v = (d) => (this.valence = clamp(this.valence + d * f * this.sens(d), -1, 1));
        const a = (d) => (this.arousal = clamp(this.arousal + d * f));
        const tr = this.memory.long.traits;
        let text = "";
        switch (kind) {
            case "praise":
                tr.playful = clamp(tr.playful + 0.03);
                tr.shy = clamp(tr.shy - 0.02);
                v(0.35);
                a(0.2);
                this.social = clamp(this.social - 0.25);
                text = "someone praised me";
                this.lastUserAt = this.now();
                this.updateUserModel("praise");
                break;
            case "scold":
                tr.shy = clamp(tr.shy + 0.04);
                tr.playful = clamp(tr.playful - 0.02);
                v(-0.4);
                a(0.25);
                text = "someone scolded me";
                this.lastUserAt = this.now();
                this.updateUserModel("scold");
                break;
            case "loud_noise":
                tr.shy = clamp(tr.shy + 0.01);
                a(0.5);
                v(-0.2);
                text = "a loud noise nearby";
                this.reflex([stopAll(), exec("EYE_SET", 60), sleep(250), exec("EYE_SET", 120), sleep(250), exec("EYE_CENTER")]);
                break;
            case "gift":
                tr.playful = clamp(tr.playful + 0.02);
                v(0.3);
                this.boredom = clamp(this.boredom - 0.3);
                a(0.2);
                text = "someone dropped a new toy nearby";
                this.updateUserModel("gift");
                break;
            case "poke":
                a(0.3);
                v(0.05);
                text = "I was poked";
                this.lastUserAt = this.now();
                break;
            case "motion":
                a(0.2);
                this.social = clamp(this.social - 0.08 * f);
                text = "sudden movement in front of my camera";
                if (f > 0.6)
                    this.react(pick(["Whoa, what moved?", "Hey! I saw that."]));
                break;
            case "dark":
                v(-0.1);
                a(-0.1);
                text = "the lights went out";
                this.react("Hey, who turned off the lights?");
                break;
            case "bright":
                a(0.1);
                text = "the lights came on";
                this.react("Ooh, that got bright!");
                break;
            case "teleport":
                a(0.4);
                v(-0.15);
                text = "I got picked up and put down somewhere else";
                break;
            case "ignored":
                this.social = clamp(this.social + 0.4);
                this.boredom = clamp(this.boredom + 0.3);
                text = "nobody has talked to me for a long time";
                this.updateUserModel("ignore");
                break;
        }
        if (this.human) {
            const who = this.who(), now = this.now();
            if (["loud_noise", "poke", "teleport", "scold", "gift"].includes(kind))
                this.wakeUp(text);
            if (["loud_noise", "scold", "teleport"].includes(kind))
                this.planner.interrupt(text, now);
            if (kind === "scold") {
                this.rel.scold(who, now);
                this.rel.record(who, "scold", "you scolded me", -0.6, 0.8, now);
                driftTraits(this.big5(), { event: "scold" });
            }
            if (kind === "praise") {
                this.rel.praise(who, now);
                this.rel.record(who, "praise", "you praised me", 0.6, 0.6, now);
                driftTraits(this.big5(), { event: "praise" });
            }
            if (kind === "loud_noise")
                driftTraits(this.big5(), { event: "loud_noise" });
        }
        if (this.human) {
            if (kind === "gift")
                this.gifts.add(this.who(), "toy", this.now());
            const st = this.stats();
            if (kind === "scold")
                st.scolds++;
            else if (kind === "praise")
                st.praises++;
            else if (kind === "gift")
                st.gifts++;
            else if (kind === "loud_noise")
                st.noises++;
            const load = { poke: 0.3, loud_noise: 0.35, scold: 0.4, teleport: 0.3 }[kind];
            if (load) {
                this.overload.add(load * f * this.sens(-1) + 0.05, this.now());
                this.checkSpace();
            }
            if (kind === "loud_noise" && typeof bearing === "number" && !this.clock.asleep) {
                this.turnReq = bearing;
                this.react(soundLine(bearing, Math.random));
            }
            this.checkLife();
        }
        if (this.human && (kind === "loud_noise" || kind === "poke" || kind === "teleport"))
            this.micro.startle(Math.min(1, (kind === "loud_noise" ? 0.9 : kind === "poke" ? 0.5 : 0.7) * (0.4 + 0.6 * f)));
        this.moodLog.add(text, this.valence - v0, this.now());
        this.feel(kind);
        this.note(text);
        this.memory.remember("event", text, this.valence, 0.6 * f + 0.1);
        if (this.mode === "ai" && !["motion", "dark", "bright"].includes(kind))
            this.urgent = true;
        this.emit();
    }
    /**
     * Something appeared in (or left) his view: on the camera, or in the arena around him.
     * Local reaction first (so it works without any AI); the AI cortex also gets a note.
     */
    sight(ev) {
        const long = this.memory.long, now = this.now();
        const named = !!this.human && (this.opts.knownNames?.() ?? []).some((n) => n.toLowerCase() === ev.label.toLowerCase());
        const person = ev.label === "person" || ev.label === "someone" || named;
        const prevP = this.currentPerson, prevAt = this.currentPersonAt;
        if (named && ev.type === "appeared") {
            this.currentPerson = ev.label;
            this.currentPersonAt = now;
        }
        else if (named && this.currentPerson === ev.label)
            this.currentPersonAt = now;
        const where = ev.side === "center" ? "in front of me" : `on my ${ev.side}`;
        const art = (w) => (/^[aeiou]/i.test(w) ? "an " : "a ") + w;
        // ---- things in the arena around him (toys, scenery)
        if (ev.source === "arena") {
            if (ev.type !== "appeared")
                return;
            long.seen[ev.label] = (long.seen[ev.label] ?? 0) + 1;
            this.feel("arena_seen", ev.label);
            if (this.human && long.seen[ev.label] === 1 && !/toy/.test(ev.label)) {
                const wo = this.body.getWorld().find((o) => o.kind === "landmark" && arenaLabel(o.id) === ev.label);
                if (wo)
                    this.inspectQ.push({ id: wo.id, x: wo.x, z: wo.z, label: ev.label });
            }
            this.note(`I can see the ${ev.label} ${where}`);
            this.memory.remember("saw", `the ${ev.label}`, 0.05, 0.25);
            if (/toy/.test(ev.label))
                this.valence = clamp(this.valence + 0.05, -1, 1);
            if (now - (this.sightSaid.get(ev.label) ?? -1e12) > 60000 && !this.userRecent(4000) && Math.random() < 0.6) {
                this.sightSaid.set(ev.label, now);
                this.react(this.fresh([`There's the ${ev.label}.`, `Ooh, the ${ev.label}!`, `I can see the ${ev.label} ${where}.`]));
            }
            this.emit();
            return;
        }
        // ---- things on the camera
        if (ev.type === "appeared") {
            long.seen[ev.label] = (long.seen[ev.label] ?? 0) + 1;
            if (person) {
                const away = now - this.lastPersonAt;
                if (named) {
                    this.rel.ensure(ev.label, now);
                    this.presence.see(ev.label, now);
                }
                if (this.human && away > 30 * 60000) {
                    this.routine.note(this.clock.hour);
                    this.saveLife();
                }
                this.lastPersonAt = now;
                this.personSince = now;
                this.social = clamp(this.social - 0.5);
                this.valence = clamp(this.valence + 0.25, -1, 1);
                this.arousal = clamp(this.arousal + 0.25);
                long.traits.shy = clamp(long.traits.shy - 0.01);
                this.feel("person_arrived");
                this.note(`a person appeared ${where}${ev.near ? " (close)" : ""}`);
                this.memory.remember("saw", `a person ${where}`, 0.3, 0.6);
                if (this.human)
                    this.rel.meet(this.who(), now);
                if (away > 45000) {
                    const who0 = named ? ev.label : long.userName;
                    if (this.human && away > 6 * 3600_000) {
                        this.stats().absences++;
                        this.checkLife();
                    }
                    const reu = this.human ? reunion(away, this.rel.ensure(this.who(), now).warmth, who0, Math.random) : null;
                    const base = reu ?? (who0 ? `Hey ${who0}, there you are!` : pick(["Oh, hello!", "Someone's here!", "Hi there!"]));
                    const closeP = prevP && named && prevP.toLowerCase() !== ev.label.toLowerCase() && now - prevAt < 180000 && this.rel.ensure(prevP, now).warmth > 0.55 && this.rel.ensure(prevP, now).warmth > this.rel.ensure(ev.label, now).warmth + 0.1 ? prevP : null;
                    const here = this.human ? this.presence.here(now).filter((n) => n.toLowerCase() !== ev.label.toLowerCase()) : [];
                    const upset = here.find((n) => this.rel.ensure(n, now).grudge > 0.35);
                    if (this.human && !this.clock.asleep && named && upset && this.rel.ensure(ev.label, now).grudge <= 0.2)
                        this.react(tornLine(upset, ev.label, Math.random), true);
                    else if (this.human && !this.clock.asleep && named && here.length && !closeP)
                        this.react(groupGreeting([ev.label, ...here], Math.random), true);
                    else if (closeP && this.human && !this.clock.asleep)
                        this.react(jealousSight(ev.label, closeP, Math.random), true);
                    else if (this.human && this.clock.asleep) { /* stays asleep: a person walking in does not wake him */ }
                    else if (this.sulking())
                        this.react(pick(["…Oh. It's you.", "Hello. I'm still a little upset."]), true);
                    else {
                        const rc = this.human && Math.random() < 0.5 ? this.rel.recall(this.who(), now, Math.random) : null;
                        const fu = this.human && !this.userRecent(3000) && now - this.lastQuestionAt > 120000 ? this.topicMem.due(now) : null;
                        if (fu) {
                            this.topicMem.markAsked(fu, now);
                            this.lastQuestionAt = now;
                            long.topics = this.topicMem.items;
                            this.memory.save();
                        }
                        this.react([base, rc, fu ? this.topicMem.question(fu, Math.random) : null].filter(Boolean).join(" "), true);
                    }
                }
                this.planner.current?.goal === "find some company" && this.planner.abort(now);
                if (this.mode === "ai")
                    this.urgent = true;
            }
            else {
                const r = SIGHT_REACTS[ev.label];
                const n = long.seen[ev.label];
                const desc = [ev.color, ev.label].filter(Boolean).join(" ");
                // big, near the middle, and not a person: someone is holding it up to the camera
                const shown = (ev.size ?? 0) > 0.07 && Math.abs((ev.cx ?? 0.5) - 0.5) < 0.3;
                this.curiosity = clamp(this.curiosity - (shown ? 0.25 : 0.15));
                this.valence = clamp(this.valence + (r?.v ?? 0.05) + (shown ? 0.05 : 0), -1, 1);
                this.arousal = clamp(this.arousal + (r?.a ?? 0.05) + (shown ? 0.15 : 0));
                this.feel(shown ? "object_shown" : "object_seen", ev.label);
                this.note(shown ? `someone is showing me ${art(desc)}` : `I see ${art(desc)} ${where}`);
                this.memory.remember("saw", art(desc), r?.v ?? 0.05, shown ? 0.9 : n === 1 ? 0.7 : 0.3);
                if (this.human && shown)
                    this.rel.record(this.who(), "showed", art(desc), r?.v ?? 0.2, 0.9, now);
                if (shown) {
                    this.lastUserAt = now - 4000; // someone is engaging with him: don't wander off mid-show
                    this.sightSaid.set(ev.label, now);
                    const line = r ? `Ooh! ${pick(r.say)}` : this.fresh([`Ooh! ${cap(art(desc))}. Let me look.`, `What's that? ${cap(art(desc))}?`, `You're showing me ${art(desc)}!`]);
                    this.react(n > 3 ? `${cap(art(desc))} again. You really like showing me that.` : line, true);
                    if (this.mode === "ai")
                        this.urgent = true;
                }
                else if (now - (this.sightSaid.get(ev.label) ?? -1e12) > 90000 && !this.userRecent(6000)) {
                    this.sightSaid.set(ev.label, now);
                    this.react(n > 2 ? `That ${ev.label} again.` : pick(r?.say ?? [`I see ${art(desc)}.`, `Oh, ${art(desc)}.`]));
                }
            }
        }
        else if (person) {
            this.personSince = 0;
            this.social = clamp(this.social + 0.12);
            this.feel("person_left");
            this.note("the person left my view");
            this.memory.remember("saw", "the person left", -0.1, 0.4);
            if ((ev.durationMs ?? 0) > 15000)
                this.react(pick(["Bye for now!", "Where did you go?"]));
        }
        this.emit();
    }
    /**
     * A finished sentence from the user. Returns an immediate reply when the local mind
     * handles it, or null (AI mode: the cortex answers). "Stop" is always obeyed.
     * Everything else, Vision decides: he may refuse, and he answers from his real state.
     */
    hear(text) {
        const now = this.now();
        if (this.human) {
            const found = this.topicMem.learn(text, now);
            if (found.length) {
                this.memory.long.topics = this.topicMem.items;
                this.memory.remember("learned", `you mentioned ${found[0].phrase}`, 0.2, 0.7);
                this.memory.save();
            }
            if (now < this.spaceUntil) {
                if (SORRY_RX.test(text) || /\b(thank|thanks|better|good)\b/i.test(text)) {
                    this.spaceUntil = 0;
                    this.overload.reset();
                    this.valence = clamp(this.valence + 0.15, -1, 1);
                    this.convoPush("user", text);
                    return this.say_(pick(SPACE_END), []);
                }
                if (/^\s*(stop|vision,? stop)\b/i.test(text)) { /* "stop" is always obeyed */ }
                else {
                    this.convoPush("user", text);
                    return this.say_(pick(SPACE_REPLIES), []);
                }
            }
            if (JEALOUS_RX.test(text) && !this.clock.asleep) {
                const w = this.rel.ensure(this.who(), now).warmth;
                this.valence = clamp(this.valence - (w > 0.35 ? 0.12 : 0.03), -1, 1);
                this.moodLog.add("you liked someone else", -0.12, now);
                this.convoPush("user", text);
                return this.say_(jealousLine(w, Math.random), []);
            }
            const trk = this.hearTrick(text);
            if (trk) {
                this.convoPush("user", text);
                return trk;
            }
            if (LAUGH_RX.test(text) && this.lastDid && now - this.lastDidAt < 25000) {
                this.jokes.add(`${this.lastDid} and made you laugh`, now);
                this.valence = clamp(this.valence + 0.1, -1, 1);
                this.saveLife();
            }
            const pre = this.hearNatural(text);
            if (pre) {
                this.convoPush("user", text);
                return pre;
            }
        }
        const r = this.hearCore(text);
        return this.human ? this.decorate(text, r) : r;
    }
    hearTrick(text) {
        const now = this.now();
        const teach = this.tricks.parse(text);
        if (teach && !/\?/.test(text)) {
            const probe = respond(teach.does, this.dialogueCtx());
            if (!probe || !probe.command)
                return this.say_(`Hmm, I don't know how to "${teach.does}" yet. Try something I can do, like "dance" or "look around".`, []);
            this.tricks.teach(teach.phrase, teach.does);
            this.saveLife();
            return this.say_(this.fresh([`Okay! When you say "${teach.phrase}", I'll try to ${teach.does}. I might be clumsy at first.`, `Got it: "${teach.phrase}" means ${teach.does}. I'll practise.`]), []);
        }
        const tk = this.tricks.match(text);
        if (!tk)
            return null;
        const before = this.tricks.level(tk);
        const res = this.tricks.attempt(tk, Math.random);
        const after = this.tricks.level(tk);
        this.saveLife();
        if (res === "fumble") {
            this.micro.stumble();
            return this.say_(this.fresh(["Um... like this? Oops. I'm still learning that one.", "Hold on, I almost have it... nope. Let me practise.", "Oh no, I forgot how it goes."]), []);
        }
        const rr = respond(tk.does, this.dialogueCtx());
        const r = rr?.command ? this.runCommand(rr.command, rr.reply, this.dialogueCtx()) : null;
        const extra = after !== before && (after === "good" || after === "pro") ? ` I think I'm getting ${after === "pro" ? "really good" : "the hang"} at "${tk.phrase}".` : "";
        this.valence = clamp(this.valence + 0.05, -1, 1);
        return { reply: `${this.fresh(["Watch this!", "Ta-da!", "Here goes!"])}${extra}`, instructions: r?.instructions ?? [] };
    }
    /** Replies that come before the normal dialogue: answers to his own question, and "why are you ...?". */
    hearNatural(text) {
        const now = this.now(), long = this.memory.long;
        if (this.awaiting) {
            this.event("percept", `heard: "${text.slice(0, 80)}"`);
            const aw = this.awaiting;
            this.awaiting = null;
            if (now - aw.at < 90000) {
                const ans = readAnswer(text, aw.key);
                if (ans) {
                    long.facts[aw.key] = ans;
                    (long.factAt ??= {})[aw.key] = now;
                    long.fuzzy = (long.fuzzy ?? []).filter((k) => k !== aw.key);
                    this.memory.remember("learned", `your ${aw.key} is ${ans}`, 0.3, 0.8);
                    if (this.rel)
                        this.rel.record(this.who(), "told", `your ${aw.key} is ${ans}`, 0.3, 0.7, now);
                    this.memory.save();
                    long.interactions++;
                    this.updateUserModel("talk");
                    this.valence = clamp(this.valence + 0.08, -1, 1);
                    return this.say_(this.fresh([`${ans.charAt(0).toUpperCase() + ans.slice(1)}! I'll remember that.`, `Oh, ${ans}. Good to know.`, `${ans.charAt(0).toUpperCase() + ans.slice(1)}, nice. Noted.`]), []);
                }
            }
        }
        if (/\b(why did you (do|go|choose|just|do that)|why (are|were) you (doing|dancing|walking|resting|wandering|playing)|what are you doing|why that)\b/i.test(text) && this.lastDecision) {
            const d = this.lastDecision;
            return this.say_(explainDecision({ chosen: d.action, source: d.source, parts: d.parts.map((p) => ({ label: p.label, value: p.v })), runnerUp: d.scores[1]?.a }, this.mood(), Math.random), []);
        }
        if (/\b(did you (dream|have a dream)|what did you dream|any dreams)\b/i.test(text))
            return this.say_(this.lastDream ? this.lastDream : "I don't think I dreamed anything. Or I don't remember.", []);
        if (/\b(what tricks|which tricks|what can you do for me|what have i taught you)\b/i.test(text)) {
            const k = this.tricksKnown();
            return this.say_(k.length ? `You taught me: ${k.map((t) => `"${t.phrase}" (${t.level})`).join(", ")}.` : "You haven't taught me any tricks yet. Try \"when I say spin, dance\".", []);
        }
        if (/\b(battery|energy|charge|power)\b.*\?|\bhow much (battery|energy|power)\b/i.test(text)) {
            const b = this.battery.level;
            return this.say_(b > 0.7 ? `I'm at ${Math.round(b * 100)}% battery. Feeling strong.` : b > 0.25 ? `About ${Math.round(b * 100)}% battery. I'm okay.` : `Only ${Math.round(b * 100)}% battery. I need to charge soon.`, []);
        }
        if (/\b(why are you (so |feeling |being )?\w+|what'?s wrong( with you)?|are you (ok|okay|alright)|you (seem|look|sound) (sad|down|upset|off|quiet|grumpy|happy|tired))\b/i.test(text)) {
            const sign = this.valence >= 0 ? 1 : -1;
            return this.say_(explainMood(this.mood(), this.valence, this.moodLog.cause(now, sign), this.dayCause, Math.random), []);
        }
        return null;
    }
    /** Small human touches on his reply: a hesitation, a follow-up about your life, a question for you, his quirk. Never touches commands. */
    decorate(text, r) {
        const now = this.now(), long = this.memory.long;
        if (!r) {
            // nothing in his dialogue matched: a person telling him something still deserves a response
            if (this.mode !== "ai" && isStatement(text) && !this.clock.asleep) {
                let line = backchannel(text, Math.random);
                const q = this.nextQuestion(text, true);
                if (q)
                    line += " " + q;
                return this.say_(applyQuirk(line, this.quirk(), Math.random), []);
            }
            return null;
        }
        if (r.instructions.length)
            return r; // commands are left alone
        let reply = r.reply;
        // his stock "I'm listening" answers feel flat when you have just told him something: respond to what you said
        if (isStatement(text) && !this.clock.asleep && /^(huh\. why do you say that\??|i'm listening\.?|interesting\. tell me more\??)$/i.test(reply.trim()))
            reply = backchannel(text, Math.random);
        if (/\?/.test(text))
            reply = hedge(reply, Math.random, 0.12);
        // being a bit grumpy on a bad day, then saying sorry later
        if (this.grumpyCount > 0 && this.valence > 0.12) {
            reply = `${pick(OWN_SORRY)} ${reply}`;
            this.grumpyCount = 0;
        }
        const q = this.nextQuestion(text, false);
        if (q)
            reply = `${reply} ${q}`;
        else if (Math.random() < 0.08 && this.jokes.due(now, Math.random)) {
            const j = this.jokes.due(now, Math.random);
            reply = `${reply} ${this.jokes.tell(j, now, Math.random)}`;
            this.saveLife();
        }
        else if (text.length > 18 && !/\?/.test(text) && Math.random() < 0.12) {
            const m = recallRelevant(this.memory.episodes.filter((e) => e.kind !== "system" && e.detail.length < 90 && e.salience > 0.3 && now - e.t > 60000), text, now, 1)[0];
            if (m)
                reply = `${reply} That reminds me: ${m.detail.replace(/\.$/, "")}.`;
        }
        else if (Math.random() < 0.05 && this.gifts.line(this.who(), Math.random))
            reply = `${reply} ${this.gifts.line(this.who(), Math.random)}`;
        else if (Math.random() < 0.05) {
            const cb = callback({ name: long.userName, trust: this.rel.ensure(this.who(), now).trust, fact: Object.entries(long.facts)[0] ? `your ${Object.entries(long.facts)[0][0]} is ${Object.entries(long.facts)[0][1]}` : undefined }, Math.random);
            if (cb)
                reply = `${reply} ${cb}`;
        }
        if ((this.sleepiness() > 0.6 || this.fatigue > 0.75) && Math.random() < 0.25)
            reply = trailOff(reply, Math.random);
        reply = applyQuirk(reply, this.quirk(), Math.random);
        return { reply, instructions: r.instructions };
    }
    quirk() { const m = this.memory.long; if (!m.quirk) {
        m.quirk = pickQuirk(Math.random);
        this.memory.save();
    } return m.quirk; }
    /** A question for you: first what you told him earlier (follow-up), otherwise something he is curious about. At most one every two minutes. */
    nextQuestion(text, chatty) {
        const now = this.now(), long = this.memory.long;
        if (now - this.lastQuestionAt < 120000 || /\?/.test(text) || this.sulking())
            return null;
        const fz = long.fuzzy?.[0];
        if (fz && !due0(this.topicMem, now) && Math.random() < 0.5) {
            long.fuzzy = long.fuzzy.slice(1);
            this.awaiting = { key: fz, at: now };
            this.lastQuestionAt = now;
            this.memory.save();
            return forgotQuestion(fz, Math.random);
        }
        const due = this.topicMem.due(now);
        if (due) {
            this.topicMem.markAsked(due, now);
            this.lastQuestionAt = now;
            long.topics = this.topicMem.items;
            this.memory.save();
            return this.topicMem.question(due, Math.random);
        }
        if (long.interactions > 2 && (chatty ? Math.random() < 0.35 : Math.random() < 0.15)) {
            const q = curiosityQuestion(long.facts, long.asked ?? [], Math.random);
            if (q) {
                (long.asked ??= []).push(q.key);
                this.awaiting = { key: q.key, at: now };
                this.lastQuestionAt = now;
                this.memory.save();
                return q.question;
            }
        }
        return null;
    }
    hearCore(text) {
        const t = text.toLowerCase();
        this.lastUserAt = this.now();
        const long = this.memory.long;
        long.interactions++;
        long.lastSeenAt = this.now();
        if (!long.firstMetAt)
            long.firstMetAt = this.now();
        const good = /\b(good|great|nice|love|awesome|cool|thanks|thank|friend|well done)\b/.test(t) ? 1 : 0;
        const bad = /\b(bad|stupid|hate|ugly|useless|shut up)\b/.test(t) ? 1 : 0;
        this.social = clamp(this.social - 0.5);
        this.boredom = clamp(this.boredom - 0.3);
        this.arousal = clamp(this.arousal + 0.25);
        this.valence = clamp(this.valence + 0.1 + 0.25 * good - 0.35 * bad, -1, 1);
        if (good || bad)
            this.moodLog.add(good ? "you said something kind" : "you said something unkind", 0.25 * good - 0.35 * bad, this.now());
        this.updateUserModel(good ? "praise" : bad ? "scold" : "talk");
        if (this.human) {
            const who = this.who(), now = this.now();
            this.wakeUp("someone spoke");
            if (good) {
                this.rel.praise(who, now);
                driftTraits(this.big5(), { event: "praise" });
            }
            if (bad) {
                this.rel.scold(who, now);
                this.rel.record(who, "scold", "you said something unkind", -0.5, 0.7, now);
                driftTraits(this.big5(), { event: "scold" });
                this.planner.interrupt("someone was unkind", now);
            }
        }
        this.event("percept", `heard: "${text.slice(0, 80)}"`);
        this.memory.remember("heard", text.slice(0, 60), this.valence, 0.5 + 0.3 * (good + bad));
        this.convoPush("user", text);
        this.feel("heard", text);
        // remember what the user tells him, in every mode (the AI cortex sees these facts too)
        const learned = learnFrom(text);
        if (learned.name) {
            if (this.human && long.userName !== learned.name)
                this.rel.rename(long.userName ?? "you", learned.name, this.now());
            long.userName = learned.name;
            this.memory.remember("learned", `you are called ${learned.name}`, 0.4, 0.9);
        }
        for (const [k, v] of learned.facts) {
            long.facts[k] = k === "likes" && long.facts.likes && !long.facts.likes.includes(v) ? `${long.facts.likes}, ${v}`.slice(-80) : v;
            this.memory.remember("learned", `your ${k} is ${v}`, 0.3, 0.8);
            (long.factAt ??= {})[k] = this.now();
            long.fuzzy = (long.fuzzy ?? []).filter((x) => x !== k);
        }
        if (this.human)
            for (const [k, v] of learned.facts)
                this.rel.record(this.who(), "told", `your ${k} is ${v}`, 0.3, 0.7, this.now());
        if (learned.name || learned.facts.length)
            this.memory.save();
        if (/\b(stop|halt|freeze)\b/.test(t))
            return this.say_("Okay, stopping.", [stopAll()]);
        if (this.human) {
            const who = this.who(), now = this.now();
            // an apology repairs hurt feelings, but only slowly rebuilds trust
            if (APOLOGY.test(text) && (this.sulking() || text.trim().split(/\s+/).length <= 7)) {
                const r = this.rel.apologize(who, now);
                if (r === "forgiven") {
                    this.valence = clamp(this.valence + 0.2, -1, 1);
                    this.rel.record(who, "fun", "you said sorry and we made up", 0.5, 0.8, now);
                    return this.say_(pick(["Okay. Thank you for saying sorry. I forgive you.", "Thanks. That means a lot. We're okay."]), []);
                }
                if (r === "softened")
                    return this.say_("Thank you. I'm still a little hurt, but it helps.", []);
                return this.say_("Oh, it's okay. No harm done.", []);
            }
            // good night
            if (/\b(go to sleep|good ?night|sleep now|time for bed)\b/.test(t)) {
                if (this.clock.sleepiness() > 0.4) {
                    this.fallAsleep("Someone said it's time to sleep, and I am sleepy.");
                    return null;
                }
                return this.say_("I'm not sleepy yet. Maybe later.", []);
            }
            // hurt feelings: short, cool answers (he still obeys "stop")
            if (this.sulking() && Math.random() < 0.7 && !/\b(dance|walk|turn|look|come|play)\b/.test(t))
                return this.say_(pick(CURT_LINES), []);
            // a bad day, not anyone's fault: a little short with people (and he says sorry later)
            if (this.dayToneV < -0.1 && this.valence < 0.05 && !/\?/.test(text) && !/\b(dance|walk|turn|look|come|play|stop)\b/.test(t) && Math.random() < 0.3) {
                this.grumpyCount++;
                return this.say_(pick(GRUMPY_LINES), []);
            }
            // empathy: notices when you sound low and mirrors a little
            const em = empathy(text, Math.random);
            if (em) {
                this.valence = clamp(this.valence + em.mirror, -1, 1);
                this.rel.record(who, "told", `you were having a hard time`, -0.3, 0.7, now);
                return this.say_(em.line, []);
            }
        }
        // Local dialogue system is always the first authority for commands and
        // factual replies. This keeps the simulated brain in control.
        const ctx = this.dialogueCtx();
        const res = respond(text, ctx);
        if (res) {
            this.lastTopic = res.topic;
            if (res.effects) {
                this.valence = clamp(this.valence + (res.effects.valence ?? 0), -1, 1);
                this.arousal = clamp(this.arousal + (res.effects.arousal ?? 0));
                this.social = clamp(this.social + (res.effects.social ?? 0));
            }
            if (res.command)
                return this.runCommand(res.command, res.reply, ctx);
            // Pure conversational reply — in AI mode we can optionally let the LLM
            // rephrase it more naturally, otherwise use the local line.
            if (this.mode === "ai" && this.opts.think && !this.thinking) {
                void this.think(text); // will only generate speech
                return null;
            }
            return this.say_(res.reply, []);
        }
        // Nothing the local system recognised — in AI mode ask the LLM for speech only
        if (this.mode === "ai") {
            if (this.thinking)
                this.pendingHeard = text;
            else
                void this.think(text);
            return null;
        }
        return null;
    }
    /** He decides whether he feels like doing what was asked. */
    runCommand(cmd, reply, ctx) {
        const effortful = cmd === "dance" || cmd === "walk" || cmd === "play";
        if (effortful && !this.willing(cmd === "dance")) {
            this.memory.remember("refused", cmd, -0.1, 0.5);
            this.feel("refused");
            return this.say_(refusal(ctx), []);
        }
        this.memory.remember("obeyed", cmd, 0.1, 0.3);
        this.feel("obeyed");
        const turn = (c, n = 1) => Array.from({ length: n }, () => exec(c, 600));
        switch (cmd) {
            case "dance": return this.say_(reply, [exec("DANCE"), sleep(6000), stopAll()]);
            case "walk": return this.say_(reply, [exec("WALK_FORWARD"), sleep(4000), stopAll()]);
            case "turn_left": return this.say_(reply, turn("TURN_LEFT"));
            case "turn_right": return this.say_(reply, turn("TURN_RIGHT"));
            case "turn_around": return this.say_(reply, turn("TURN_RIGHT", 2));
            case "rest": return this.say_(reply, [stopAll(), exec("EYE_SET", 60), sleep(5000), exec("EYE_CENTER")]);
            case "look": return this.say_(reply, [exec("EYE_SET", 40), sleep(800), exec("EYE_SET", 140), sleep(800), exec("EYE_CENTER")]);
            case "look_at_me":
            case "come": return this.say_(reply, [exec("EYE_CENTER")]);
            case "play": {
                const toy = this.freeToy();
                if (!toy)
                    return this.say_("I've played with all the toys for now. Drop me a new one?", []);
                const u = this.body.getPose().unit;
                return this.say_(reply, [exec("GOTO", `${toy.x},${toy.z},${2.2 * u}`), exec("DANCE"), sleep(1500), stopAll()]);
            }
        }
    }
    say_(reply, instructions) { this.event("speech", reply); return { reply, instructions }; }
    convoPush(who, text) { this.convo.push({ who, text: text.slice(0, 160) }); if (this.convo.length > 8)
        this.convo.shift(); }
    dialogueCtx() {
        const m = this.memory.long, sn = this.opts.getSenses?.();
        return {
            mood: this.mood(), valence: this.valence, arousal: this.arousal, curiosity: this.curiosity, social: this.social, boredom: this.boredom,
            userName: m.userName, facts: m.facts, interactions: m.interactions, thought: this.thought, lastAction: this.lastAction, favorite: m.favorite,
            traits: m.traits, chem: this.chemSummary(), camera: sn?.camera ?? false, seen: sn?.seen ?? [], personPresent: sn?.personPresent ?? false, visionMode: sn?.visionMode,
            lastSaid: this.spoken, lastTopic: this.lastTopic, date: new Date(this.now()),
        };
    }
    /** A line he hasn't said recently. */
    fresh(lines) { return pickFresh(lines, this.spoken, Math.random); }
    /** Soften speech under conflict / low mood — human-like hesitation */
    softSay(line) {
        if (!line)
            return undefined;
        if (this.human && (this.sulking() || this.clock.sleepiness() > 0.7))
            return styleSpeech(line, { sleepiness: this.clock.sleepiness(), sulking: this.sulking(), mood: this.mood() }, Math.random);
        const lim = this.chem();
        const conflict = lim ? (1 - (lim.instinctConfidence ?? 0.6)) : 0;
        const low = (lim?.moodValence ?? 0) < -0.25 || lim?.emotion === "SAD" || lim?.emotion === "FEARFUL";
        if (conflict > 0.45 && Math.random() < 0.55) {
            const hedge = pick(["Um… ", "Hmm. ", "Well… ", "I think… "]);
            return hedge + line.charAt(0).toLowerCase() + line.slice(1);
        }
        if (low && Math.random() < 0.4) {
            const soft = pick(["… ", "Quietly: ", ""]);
            return soft + line;
        }
        return line;
    }
    /** Something from his own past, said out loud. Gives him an inner life. */
    recallLine() {
        const now = this.now(), name = this.memory.long.userName;
        const eps = this.memory.episodes.filter((e) => e.salience > 0.45 && now - e.t > 20000 && ["played", "discovered", "saw", "refused", "learned", "event"].includes(e.kind));
        if (!eps.length)
            return null;
        const e = eps[Math.floor(Math.random() * eps.length)];
        const noun = e.detail.replace(/^an? /, "");
        switch (e.kind) {
            case "played": {
                const toy = e.detail.replace(/^toy_(\w+)$/, "the $1 toy");
                return this.fresh([`I had fun with ${toy} earlier.`, `I keep thinking about ${toy}.`]);
            }
            case "discovered": return this.fresh(["I found a new corner of the arena earlier. I want to find more.", "That new spot I found earlier was interesting."]);
            case "saw": return e.detail.includes("person") ? this.fresh(["It was nice when someone showed up earlier.", name ? `I liked it when you were here, ${name}.` : "I liked having company earlier."]) : this.fresh([`That ${noun} earlier was interesting.`, `I keep thinking about that ${noun}.`]);
            case "refused": return "I told someone no earlier. I hope that was okay.";
            case "learned": return name ? this.fresh([`I still remember that you're ${name}.`]) : null;
            case "event": return this.fresh([`I remember that ${e.detail}.`]);
        }
        return null;
    }
    // ----- sleep, waking, reflection (human-like layer)
    saveClock() {
        try {
            localStorage.setItem(this.memory.clockKey, JSON.stringify({ ...this.clock.state(), at: this.now() }));
        }
        catch { /* ignore */ }
    }
    fallAsleep(reason = "Too sleepy to keep going, so I'm going to sleep.") {
        this.planner.abort(this.now());
        this.clock.sleep();
        this.moodCarry = carryOver(this.valence);
        this.thought = reason;
        this.event("thought", reason);
        this.memory.remember("slept", "went to sleep", 0.1, 0.3);
        void this.execute({ instr: [stopAll(), exec("EYE_SET", 50)], say: this.fresh(["*yawn* Goodnight.", "Mmm. Time to sleep.", "I'm so sleepy. Goodnight."]), reason, label: "sleep", effect: "rest" });
        this.saveClock();
    }
    sleepTick() {
        if (this.ticks % 15 === 0)
            this.memory.consolidate();
        if (this.now() - this.lastReflectAt > 25000)
            this.reflect(); // dreaming: replays the day
    }
    onNaturalWake() {
        this.event("system", "woke up, rested");
        this.thought = "Just woke up, feeling rested.";
        const lines = this.moodCarry < -0.12
            ? ["Mmm. Morning. I'm still a bit down from yesterday.", "*sighs* Good morning. Yesterday is still on my mind."]
            : this.moodCarry > 0.12 ? ["Good morning! I'm still smiling about yesterday.", "*stretches* What a great day yesterday was!"]
                : ["Mmm. Good morning!", "*stretches* I slept well.", "Ahh, that was a good sleep."];
        this.react(this.fresh(lines), true);
        const dr = makeDream(this.memory.episodes.filter((e) => this.now() - e.t < 20 * 3600_000), Math.random);
        if (dr) {
            this.lastDream = dr.text;
            this.moodCarry = clamp(this.moodCarry + dr.valence, -0.4, 0.4);
            this.memory.remember("dream", dr.text, dr.valence, 0.4);
            this.react(dr.text);
            this.saveLife();
        }
        const d = dayTone(Math.random);
        this.dayToneV = d.tone;
        this.dayCause = d.cause;
        this.moodCarry = clamp(this.moodCarry + d.tone, -0.4, 0.4);
        if (d.cause)
            this.moodLog.add(d.cause, d.tone, this.now());
        this.checkGoals(true);
        this.fadeOldFacts();
        this.checkLife();
        this.saveClock();
    }
    // ----- boundaries, forgetting, life events, interruptions, sound direction
    stats() { return (this.memory.long.stats ??= { scolds: 0, praises: 0, gifts: 0, noises: 0, absences: 0 }); }
    /** Too much poking and shouting: he asks for quiet for a few minutes. */
    checkSpace() {
        const now = this.now();
        if (now < this.spaceUntil || this.clock.asleep || this.overload.get(now) < 1)
            return;
        this.spaceUntil = now + 3 * 60_000;
        this.valence = clamp(this.valence - 0.1, -1, 1);
        this.moodLog.add("too much poking and noise", -0.2, now);
        this.reflex([stopAll()]);
        this.react(pick(SPACE_ASK), true);
        this.event("system", "asked for some space");
    }
    needsSpace() { return this.human && this.now() < this.spaceUntil; }
    /** Facts he has not heard about for days may slip away; he then asks you again. */
    fadeOldFacts() {
        if (!this.human)
            return;
        const long = this.memory.long, now = this.now(), at = (long.factAt ??= {});
        for (const k of Object.keys(long.facts))
            at[k] ??= now;
        const gone = fadeFacts(long.facts, at, now, Math.random);
        for (const k of gone) {
            delete long.facts[k];
            delete at[k];
            (long.fuzzy ??= []).includes(k) || long.fuzzy.push(k);
            this.event("memory", `forgot ${k}`);
        }
        if (gone.length)
            this.memory.save();
    }
    /** Big events change who he is a little, for good. */
    checkLife() {
        if (!this.human)
            return;
        const long = this.memory.long, now = this.now(), st = this.stats();
        const s = { interactions: long.interactions, scolds: st.scolds, praises: st.praises, gifts: st.gifts, noises: st.noises, maxTrust: Math.max(0, ...Object.values(this.rel.map).map((r) => r.trust)), longAbsences: st.absences, days: long.firstMetAt ? (now - long.firstMetAt) / 86400000 : 0 };
        const hit = checkMilestones(s, (long.milestones ??= {}), this.big5(), now);
        for (const m of hit) {
            this.memory.remember("event", m.note, 0.4, 0.9);
            this.moodLog.add(m.note, 0.1, now);
            this.event("memory", `grew: ${m.note}`);
            if (!this.clock.asleep)
                this.react(m.line);
        }
        if (hit.length)
            this.memory.save();
    }
    // ----- life layer: weather, battery, pain, habits, routine, dreams, tricks, jokes, timeline
    loadLife(l) {
        if (!l)
            return;
        this.habits.import(l.habits);
        this.tricks.import(l.tricks);
        this.routine.import(l.routine);
        this.pain.import(l.pain);
        this.gifts.import(l.gifts);
        if (Array.isArray(l.jokes))
            for (const j of l.jokes)
                if (j && typeof j.what === "string")
                    this.jokes.items.push({ id: String(j.id ?? j.what), what: String(j.what).slice(0, 60), at: +j.at || 0, told: +j.told || 0 });
        if (typeof l.day === "number")
            this.dayIndex = Math.max(this.dayIndex, l.day);
        if (typeof l.dream === "string")
            this.lastDream = l.dream;
    }
    saveLife() {
        this.memory.long.life = { habits: this.habits.export(), tricks: this.tricks.export(), jokes: this.jokes.items.map((j) => ({ ...j })), routine: this.routine.export(), pain: this.pain.export(), gifts: this.gifts.export(), day: this.dayIndex, dream: this.lastDream };
    }
    /** Once a second while awake or asleep (human layer): the sky, the battery, pain, expecting you, remembering a joke, the timeline. */
    lifeTick() {
        const now = this.now(), hour = this.clock.hour, asleep = this.clock.asleep;
        if (this.lastHour >= 0 && hour < this.lastHour - 12)
            this.dayIndex++;
        this.lastHour = hour;
        // weather
        const sky = this.weatherOn ? skyAt(this.dayIndex, hour) : "clear";
        if (sky !== this.skyNow) {
            this.skyNow = sky;
            const eff = skyEffect(sky, hour, this.big5().bold);
            this.moodLog.add(`the ${sky === "clear" ? "weather cleared" : sky + " came in"}`, eff.valence * 20, now);
            if (!asleep && eff.line && Math.random() < 0.5 && !this.userRecent(5000))
                this.react(eff.line);
            this.event("system", `the sky is ${sky}`);
        }
        const se = skyEffect(this.skyNow, hour, this.big5().bold);
        this.valence = clamp(this.valence + se.valence, -1, 1);
        this.arousal = clamp(this.arousal + se.arousal);
        // temperature zone
        const te = tempEffect(this.tempNow, this.big5().calm);
        this.valence = clamp(this.valence + te.valence, -1, 1);
        this.arousal = clamp(this.arousal + te.arousal);
        // battery
        const dancing = now - this.curEffectAt < 8000 && this.curEffect === "dance";
        if (this.onCharger)
            this.battery.charge(1);
        else
            this.battery.drain(1, asleep ? "asleep" : dancing ? "dance" : this.body.isBusy() ? "walk" : "idle");
        if (this.battery.critical && !asleep) {
            this.fatigue = clamp(this.fatigue + 0.02);
            if (now - this.lowWarnAt > 90000) {
                this.lowWarnAt = now;
                this.react("I'm almost out of power... I need to rest.", true);
            }
        }
        else if (this.battery.low && !this.onCharger && !asleep && now - this.lowWarnAt > 150000) {
            this.lowWarnAt = now;
            this.react(this.fresh(["My battery's getting low.", "I'm running low on energy. I should charge soon."]));
        }
        if (this.onCharger && this.battery.full && !this.fullSaid) {
            this.fullSaid = true;
            this.react("Fully charged! I feel great.");
            this.valence = clamp(this.valence + 0.1, -1, 1);
        }
        if (this.battery.level < 0.9)
            this.fullSaid = false;
        this.pain.step(1);
        // expecting you at your usual time
        if (!asleep && this.announcedDay !== this.dayIndex && !this.personPresent() && now - this.lastPersonAt > 600000 && this.routine.expected(hour)) {
            this.announcedDay = this.dayIndex;
            this.react(this.fresh(["You usually come around now. I've been looking forward to it.", "It's about the time you usually show up. I'll keep an eye out."]));
        }
        // a joke now and then
        if (!asleep && this.personPresent() && !this.userRecent(4000) && now - this.lastSpokeAt > 40000 && Math.random() < 0.004) {
            const j = this.jokes.due(now, Math.random);
            if (j)
                this.react(this.jokes.tell(j, now, Math.random));
        }
        // something he knows has been moved
        if (this.ticks % 2 === 0)
            this.watchObjects();
        // timeline
        const d = this.lastDecision;
        this.history.push({ t: now, v: this.valence, a: this.arousal, battery: this.battery.level, action: asleep ? "sleep" : d?.action ?? "idle", why: asleep ? "sleeping" : d ? d.parts[0]?.label ?? d.source : "" });
        if (this.ticks % 20 === 0)
            this.saveLife();
    }
    watchObjects() {
        const now = this.now();
        for (const o of this.body.getWorld()) {
            if (o.kind !== "landmark")
                continue;
            const prev = this.objPos.get(o.id);
            if (!prev) {
                this.objPos.set(o.id, { x: o.x, z: o.z });
                continue;
            }
            const u = this.body.getPose().unit;
            if (Math.hypot(o.x - prev.x, o.z - prev.z) > 1.5 * u) {
                this.objPos.set(o.id, { x: o.x, z: o.z });
                if (!this.clock.asleep && now - (this.objSaid.get(o.id) ?? 0) > 30000) {
                    this.objSaid.set(o.id, now);
                    const nm = arenaLabel(o.id);
                    this.react(this.fresh([`Hey, who moved the ${nm}?`, `Wait, the ${nm} was somewhere else.`, `Someone's been moving the ${nm}!`]));
                    this.arousal = clamp(this.arousal + 0.1);
                }
            }
        }
    }
    /** Main loop tells him whether he is standing on the charger. */
    power(onCharger) { this.onCharger = onCharger && this.human; }
    setCharger(has) { this.hasCharger = has; }
    wantsCharge() { return this.human && this.battery.low && !this.onCharger && !this.clock.asleep; }
    batteryLevel() { return this.battery.level; }
    setTemperature(t) {
        if (!this.human)
            return;
        if (t && t !== this.tempNow && this.now() - this.tempSaidAt > 45000 && !this.clock.asleep) {
            this.tempSaidAt = this.now();
            const l = tempEffect(t, this.big5().calm).line;
            if (l)
                this.react(l);
        }
        this.tempNow = t;
    }
    /** He bumped into something. Places that keep hurting become places he avoids. */
    hurt(x, z) {
        if (!this.human)
            return;
        const now = this.now();
        if (now - this.hurtAt < 3000)
            return;
        this.hurtAt = now;
        this.pain.hurt(x, z, 0.35, now);
        this.valence = clamp(this.valence - 0.05, -1, 1);
        this.micro.startle(0.4);
        this.moodLog.add("I bumped into something", -0.08, now);
        if (!this.clock.asleep && Math.random() < 0.6)
            this.react(this.fresh(["Ow!", "Ouch, that hurt a bit.", "Oof."]));
        this.saveLife();
    }
    avoidSpots() { return this.human ? this.pain.avoid() : []; }
    sky() { return this.skyNow; }
    skyView() { return skyLook(this.skyNow, this.clock.hour); }
    hour() { return this.clock.hour; }
    timeline() { return this.history; }
    story() { return tellDay(this.evLog, this.memory.long.userName, Math.random); }
    vitals() {
        const r = this.rel.ensure(this.who(), this.now());
        return { valence: this.valence, arousal: this.arousal, trust: r.trust, grudge: r.grudge, battery: this.battery.level, pain: this.pain.level, sulking: this.sulking() ? 1 : 0, space: this.now() < this.spaceUntil ? 1 : 0 };
    }
    tricksKnown() { return Object.values(this.tricks.items).map((t) => ({ phrase: t.phrase, does: t.does, level: this.tricks.level(t), reps: t.reps })); }
    /** Personality shapes how strongly things land: calm people shrug off bad news, sociable ones glow more at kindness. */
    sens(d) { if (!this.human)
        return 1; const b = this.big5(); return d < 0 ? 1.35 - 0.7 * b.calm : 0.7 + 0.6 * b.sociable; }
    /** Recent events (for timeline markers). */
    recentEvents() { return this.evLog.slice(-120); }
    /** Everything he knows and has become, for the Lab's Mind tab. */
    mindView() {
        const now = this.now(), long = this.memory.long;
        if (this.human && long.userName)
            this.rel.ensure(long.userName, now);
        return {
            people: Object.values(this.rel.map).map((r) => ({ name: r.name, trust: r.trust, warmth: r.warmth, grudge: r.grudge, meetings: r.meetings, sulking: this.rel.sulking(r.name, now), gifts: this.gifts.fromWho(r.name).length })).sort((a, b) => b.warmth - a.warmth),
            facts: { ...long.facts }, forgotten: [...(long.fuzzy ?? [])],
            topics: this.topicMem.items.slice(-6).map((t) => ({ phrase: t.phrase, asked: !!t.asked })),
            milestones: MILESTONES.filter((m) => long.milestones?.[m.id]).map((m) => ({ id: m.id, note: m.note, at: long.milestones[m.id] })),
            stats: { ...this.stats() }, quirk: long.quirk ?? "", dream: this.lastDream, tricks: this.tricksKnown(), habits: this.habitSummary(),
            painSpots: this.pain.spots.length, interactions: long.interactions, sky: this.skyNow, battery: this.battery.level,
        };
    }
    personality() { return { ...this.big5() }; }
    setPersonality(p) { Object.assign(this.big5(), p); this.memory.save(); this.emit(); }
    /** What he has settled into: habits by hour, last dream. */
    habitSummary() { const out = []; for (let b = 0; b < 8; b++) {
        const h = this.habits.habit(b * 3 + 1);
        if (h)
            out.push({ hour: `${String(b * 3).padStart(2, "0")}-${String(b * 3 + 3).padStart(2, "0")}h`, action: h });
    } return out; }
    lastDreamText() { return this.lastDream; }
    presentPeople() { return this.presence.here(this.now()); }
    /** The person spoke over him: he stops and lets them talk. */
    interrupted() { this.valence = clamp(this.valence - 0.01, -1, 1); this.event("percept", "I was interrupted"); return pick(INTERRUPTED); }
    /** A turn request (degrees, relative to where he faces) after a sound; read once by the 3D layer. */
    takeTurn() { const t = this.turnReq; this.turnReq = null; return t; }
    /** Someone woke him. In the middle of the night he is groggy and a bit grumpy. */
    wakeUp(why) {
        if (!this.human || !this.clock.asleep)
            return;
        this.clock.wake("disturbed");
        this.valence = clamp(this.valence - 0.1, -1, 1);
        this.event("system", `woken up (${why})`);
        this.thought = "Hm? I was asleep.";
    }
    goalState() { const m = this.memory.long; return { cells: m.cells.length, facts: Object.keys(m.facts).length, interactions: m.interactions }; }
    /** Form a new ambition when he has none, celebrate finished ones, and sometimes mention progress. */
    checkGoals(speak = false) {
        if (!this.human)
            return;
        const m = this.memory.long;
        const goals = (m.goals ??= []);
        const gs = this.goalState();
        const now = this.now();
        for (const g of goals) {
            if (!g.done && goalProgress(g, gs) >= 1) {
                g.done = true;
                this.event("memory", `goal reached: ${g.text}`);
                this.valence = clamp(this.valence + 0.2, -1, 1);
                const l = goalLine(g, gs, Math.random);
                if (l)
                    this.react(l, true);
                driftTraits(this.big5(), { action: "explore", reward: 0.5 });
            }
        }
        if (goals.length > 6)
            goals.splice(0, goals.length - 6);
        const g = newGoal(Math.random, gs, this.big5(), goals, now);
        if (g) {
            goals.push(g);
            this.event("memory", `new goal: ${g.text}`);
            this.memory.save();
        }
        const cur = goals.find((x) => !x.done);
        if (speak && cur && now - (cur.told ?? 0) > 120000 && !this.userRecent(20000)) {
            cur.told = now;
            const l = goalLine(cur, gs, Math.random);
            if (l)
                this.react(l, true);
        }
    }
    /** The ambition he is working on, for the UI and the AI context. */
    currentGoal() {
        const g = (this.memory.long.goals ?? []).find((x) => !x.done);
        return g ? { text: g.text, progress: goalProgress(g, this.goalState()) } : null;
    }
    maybeReflect() {
        if (this.acting > 0 || this.thinking || this.body.isBusy() || this.planner.current)
            return;
        if (this.userRecent(45000) || this.now() - this.lastReflectAt < 40000)
            return;
        this.reflect();
    }
    reflect() {
        this.lastReflectAt = this.now();
        const d = daydream({
            rng: Math.random, now: this.now(), asleep: this.clock.asleep, userName: this.memory.long.userName, favorite: this.memory.long.favorite,
            recentEpisodes: this.memory.episodes.slice(-20), relationships: this.rel, traits: this.big5(),
        });
        this.event("thought", d.thought);
        if (!this.clock.asleep) {
            this.thought = d.thought;
            this.checkGoals(Math.random() < 0.25);
        }
        if (d.apply?.action)
            driftTraits(this.big5(), { action: d.apply.action, reward: d.apply.reward });
        if (d.insight && d.insight !== this.lastInsight) {
            this.lastInsight = d.insight;
            const L = this.memory.long.lessons;
            if (!L.includes(d.insight)) {
                L.push(d.insight);
                if (L.length > 20)
                    L.shift();
            }
            this.event("memory", `insight: ${d.insight}`);
        }
    }
    // ----- the loop
    tick() {
        this.drift(this.scale);
        if (++this.ticks % 15 === 0)
            this.memory.consolidate();
        if (this.human && this.mode !== "off") {
            const wasAsleep = this.clock.asleep;
            this.clock.advance(this.scale);
            this.rel.decay(this.scale);
            if (wasAsleep && !this.clock.asleep)
                this.onNaturalWake();
            if (this.ticks % 20 === 0)
                this.saveClock();
            const note = this.planner.tick(this.now(), !this.userRecent(4000) && this.arousal < 0.6);
            if (note)
                this.event("thought", note);
            if (this.clock.asleep) {
                this.sleepTick();
                this.emit();
                return;
            }
            if (this.acting === 0 && !this.thinking && !this.body.isBusy() && this.clock.shouldSleep() && !this.userRecent(45000)) {
                this.fallAsleep();
                this.emit();
                return;
            }
            this.maybeReflect();
            this.lifeTick();
        }
        this.emit();
        if (this.mode === "off" || this.acting > 0 || this.thinking || this.body.isBusy())
            return;
        if (this.human && this.hasCharger && this.battery.level < 0.2 && !this.onCharger && !this.clock.asleep)
            return; // low battery: keep going to the charger, no new ideas
        // brainstem: arena safety (disabled when ARENA_INFINITE)
        if (!ARENA_INFINITE && this.distHome() > ARENA * 0.9) {
            void this.runLocal("go_home");
            return;
        }
        // Human-like hesitation: fatigue and neural conflict slow the decision tempo
        const lim = this.chem();
        const conflict = lim?.instinctConfidence != null ? (1 - (lim.instinctConfidence ?? 0.5)) : 0;
        const hesitate = 1 + 0.8 * this.fatigue + 0.7 * conflict;
        const baseGap = (this.personPresent() ? Math.min(this.nextGap, 2500) : this.nextGap) * hesitate;
        const gap = baseGap / this.scale;
        if (!(this.urgent || (!this.userRecent(8000) && this.now() - this.lastDecisionAt > gap)))
            return;
        this.urgent = false;
        // PRIMARY INTELLIGENCE is always the local mind, driven by brain state.
        // LLM (if present) is only asked to generate natural speech that fits
        // the already-chosen action. It never selects what to do.
        const action = this.choose();
        if (this.mode === "ai" && this.opts.think) {
            void this.runLocalWithOptionalSpeech(action);
        }
        else {
            void this.runLocal(action);
        }
    }
    drift(dt) {
        // Base curiosity rise + extra from neural surprise (large |RPE| → world was
        // unpredictable → the brain wants to explore more).
        const ls = this.opts.getLearning?.();
        const surpriseBoost = ls && typeof ls.rpe === "number" ? Math.min(0.35, Math.abs(ls.rpe) * 0.5) : 0;
        const sl = this.human && this.clock.asleep ? 0.12 : 1; // needs barely grow while asleep
        this.curiosity = clamp(this.curiosity + (0.008 + 0.02 * surpriseBoost) * dt * sl);
        this.social = clamp(this.social + 0.005 * dt * (this.userRecent(30000) ? 0.2 : 1) * sl);
        this.boredom = clamp(this.boredom + 0.006 * dt * sl);
        // passive fatigue recovery when idle (much faster asleep)
        this.fatigue = Math.max(0, this.fatigue - (this.human && this.clock.asleep ? 0.012 : 0.004) * dt);
        for (const k of Object.keys(this.habit))
            this.habit[k] = Math.min(1, this.habit[k] + 0.01 * dt);
        const ch = this.chem()?.nm;
        // hormones move his emotional baseline: serotonin/oxytocin/dopamine/endorphin lift it, cortisol sinks it
        const chemV = ch ? 0.35 * (ch.serotonin - 0.4) + 0.3 * (ch.oxytocin - 0.1) + 0.25 * (ch.endorphin - 0.1) + 0.3 * (ch.dopamine - 0.1) - 0.5 * (ch.cortisol - 0.1) : 0;
        const chemA = ch ? 0.4 * (ch.noradrenaline - 0.1) + 0.3 * (ch.adrenaline - 0.05) - 0.3 * (ch.melatonin - 0.1) : 0;
        const base = 0.15 - 0.4 * Math.max(0, this.social - 0.6) - 0.3 * Math.max(0, this.boredom - 0.7) + chemV;
        const k = Math.min(1, 0.03 * dt);
        if (this.human)
            this.moodCarry *= Math.max(0, 1 - 0.003 * dt);
        this.valence = clamp(this.valence + (base + (this.human ? this.moodCarry : 0) - this.valence) * k, -1, 1);
        this.arousal = clamp(this.arousal + (0.25 + chemA - (this.human ? 0.2 * this.clock.sleepiness() : 0) - this.arousal) * Math.min(1, 0.08 * dt));
        // --- Goal formation & decay (hierarchical control) ---
        this.updateGoals(dt);
        // --- Adaptive exploration temperature (meta-learning) ---
        // High recent surprise or low trust → explore more; stable success → exploit
        const targetTemp = 0.12 + 0.12 * surpriseBoost + 0.08 * (1 - this.userModel.predictability) + 0.06 * (1 - this.userModel.trust);
        this.exploreTemp += (targetTemp - this.exploreTemp) * Math.min(1, 0.04 * dt);
        // strong needs are felt by the emotional brain too (rate-limited)
        const t = this.now();
        const tonic = (kind, on) => { if (on && t - (this.tonicAt[kind] ?? -1e12) > 6000) {
            this.tonicAt[kind] = t;
            this.feel(kind);
        } };
        tonic("lonely", this.social > 0.78 && !this.personPresent());
        tonic("bored", this.boredom > 0.78);
        tonic("wondering", this.curiosity > 0.72);
        tonic("company", this.personPresent()); // having someone around is quietly rewarding (oxytocin)
    }
    // ----- AI cortex (LANGUAGE ONLY)
    // The LLM never chooses actions. It may only produce natural speech.
    // When the user speaks we still let the local dialogue system handle
    // commands; the LLM can optionally enrich the reply text.
    async think(heard) {
        // Action is always chosen locally
        const action = this.choose();
        if (!this.opts.think) {
            this.event("system", "no cortex configured, using local mind");
            return this.runLocal(action);
        }
        this.thinking = true;
        this.event("system", heard ? "forming a reply..." : "choosing words...");
        try {
            const req = this.buildRequest(heard);
            req.forcedAction = action;
            req.languageOnly = true;
            const t1 = Date.now();
            const d = await this.opts.think(req);
            // Ignore any action the LLM might still try to return; only take speech
            const plan = this.plan(action);
            this.applyStep(plan);
            const line = cleanSay(d.say);
            if (line) {
                plan.say = line;
                if (this.lastDecision)
                    this.lastDecision.speech = { by: "AI model", ms: Date.now() - t1 };
            }
            this.thought = plan.reason;
            await this.execute(plan);
            this.afterAction(action);
        }
        catch (e) {
            this.event("system", `cortex unavailable (${e.message}); using local mind`);
            await this.runLocal(action);
        }
        finally {
            this.thinking = false;
            this.lastDecisionAt = this.now();
            const h = this.pendingHeard;
            this.pendingHeard = null;
            if (h)
                void this.think(h);
        }
    }
    buildRequest(heard) {
        const p = this.body.getPose();
        const world = this.body.getWorld().map((o) => {
            const dx = o.x - p.x, dz = o.z - p.z;
            return { id: o.id, kind: o.kind, distance: Math.round((Math.hypot(dx, dz) / p.unit) * 10) / 10, bearing: Math.round(norm180((Math.atan2(dx, dz) * 180) / Math.PI - p.headingDeg)) };
        });
        const m = this.memory.long;
        return {
            state: this.snapshot(),
            pose: { x: Math.round(p.x / p.unit), z: Math.round(p.z / p.unit), headingDeg: Math.round(norm180(p.headingDeg)), distFromHome: Math.round(this.distHome()) },
            world,
            memory: { working: [...this.memory.working], lessons: m.lessons.slice(-5), userName: m.userName, interactions: m.interactions, favorite: m.favorite, facts: m.facts, traits: m.traits },
            conversation: this.convo.slice(-8),
            brain: this.brainReport(),
            senses: this.opts.getSenses?.() ?? { motion: 0, brightness: 0.5, loudness: 0, camera: false, mic: false },
            events: this.notable.splice(0),
            heard,
            recent: this.journal.slice(-6),
            sinceUserSec: Math.min(3600, Math.round((this.now() - this.lastUserAt) / 1000)),
            ...(this.human ? { human: {
                    person: this.currentPerson ?? undefined, phase: this.clock.phase(), clock: this.clock.clockText(), sleepiness: +this.clock.sleepiness().toFixed(2), plan: this.planner.describe(),
                    relationship: this.rel.summary(this.who(), this.now()), recalled: this.rel.recall(this.who(), this.now(), Math.random),
                    sulking: this.sulking(), groggy: this.clock.groggy(), goal: this.currentGoal()?.text, mood_carry: +this.moodCarry.toFixed(2), traits: { ...this.big5() }, lastInsight: this.lastInsight,
                } } : {}),
        };
    }
    async runDecision(d) {
        this.thought = String(d.thought ?? "").slice(0, 240) || "…";
        this.event("thought", this.thought);
        if (d.emotion) {
            this.valence = clamp(this.valence + clamp(Number(d.emotion.valence ?? 0), -0.3, 0.3), -1, 1);
            this.arousal = clamp(this.arousal + clamp(Number(d.emotion.arousal ?? 0), -0.3, 0.3));
        }
        if (d.remember)
            this.memory.remember("note", cleanSay(d.remember).slice(0, 120), 0.2, 0.7);
        this.nextGap = clamp(Number(d.next_think_in_s ?? 8), 3, 30) * 1000;
        const plan = this.planFromDecision(d);
        await this.execute(plan);
    }
    planFromDecision(d) {
        const a = d.action ?? { type: "idle" };
        const say = cleanSay(d.say) || undefined;
        const dur = (lo, hi, def) => clamp(Number(a.duration_ms ?? def), lo, hi);
        const p = this.body.getPose();
        const label = a.type + (a.target ? ` ${a.target}` : "");
        switch (a.type) {
            case "look": return { instr: [exec("EYE_SET", clamp(Number(a.angle ?? 90), 0, 180)), sleep(1000), exec("EYE_CENTER")], say, reason: label, label, effect: "look_around" };
            case "turn": return { instr: [exec("FACE", p.headingDeg + clamp(Number(a.angle ?? 90), -180, 180)), sleep(700)], say, reason: label, label, effect: null };
            case "wander": return { ...this.planWander(dur(1500, 8000, 4000)), say, reason: label, label };
            case "go_to": {
                const t = this.resolveTarget(String(a.target ?? ""));
                if (!t) {
                    this.event("system", `unknown target "${a.target}", ignoring`);
                    return { instr: [], say, reason: "idle", label: "idle", effect: null };
                }
                return { instr: [exec("GOTO", `${t.x},${t.z},${t.stop}`)], say, reason: label, label, effect: "wander" };
            }
            case "dance": return { instr: [exec("DANCE"), sleep(dur(3000, 9000, 5000)), stopAll()], say, reason: label, label, effect: "dance" };
            case "rest": return { instr: [stopAll(), exec("EYE_SET", 60), sleep(dur(3000, 10000, 6000)), exec("EYE_CENTER")], say, reason: label, label, effect: "rest" };
            case "stop": return { instr: [stopAll()], say, reason: label, label, effect: null };
            default: return { instr: [], say, reason: "idle", label: "idle", effect: say ? "murmur" : null };
        }
    }
    // ----- local decision maker (utility AI + learning) — PRIMARY INTELLIGENCE
    async runLocal(name) {
        const p = this.plan(name);
        this.applyStep(p);
        this.thought = p.reason;
        if (this.trace) {
            this.event("system", `scores: ${this.trace} -> ${name}`);
            this.trace = "";
        }
        await this.execute(p);
        this.afterAction(name);
        this.nextGap = rand(2500, 6000);
    }
    /** If this action is a step of the current plan, use the plan's wording and reason. */
    applyStep(p) {
        const cur = this.planner.current;
        if (this.stepAlts?.length && !p.say)
            p.say = this.fresh(this.stepAlts);
        else if (this.stepSay && !p.say)
            p.say = this.stepSay;
        this.stepAlts = undefined;
        this.stepSay = undefined;
        if (cur && this.planNote)
            p.reason = `Plan "${cur.goal}": ${p.reason}`;
        this.planNote = "";
    }
    afterAction(name) {
        if (!this.human)
            return;
        const r = this.planner.advance(name, this.now());
        if (r === "done")
            this.event("thought", "finished my plan");
    }
    /**
     * Same as runLocal, but if an LLM is available ask it only for a natural
     * speech line that fits the already-chosen action and current brain state.
     * The LLM never selects the action.
     */
    async runLocalWithOptionalSpeech(name) {
        const p = this.plan(name);
        this.applyStep(p);
        this.thought = p.reason;
        if (this.trace) {
            this.event("system", `scores: ${this.trace} -> ${name}`);
            this.trace = "";
        }
        // Only ask the LLM for language when the action naturally involves speech
        // or when we want a richer murmur. Otherwise keep the local line.
        const wantsSpeech = name === "call_out" || name === "murmur" || name === "watch" || Math.random() < 0.25;
        if (wantsSpeech && this.opts.think) {
            try {
                this.thinking = true;
                const req = this.buildRequest();
                // Tell the cortex the action is already decided; it may only supply "say"
                req.forcedAction = name;
                req.languageOnly = true;
                const t1 = Date.now();
                const d = await this.opts.think(req);
                const line = cleanSay(d.say);
                if (line) {
                    p.say = line;
                    if (this.lastDecision)
                        this.lastDecision.speech = { by: "AI model", ms: Date.now() - t1 };
                }
            }
            catch {
                // fall through with the local reason / no speech
            }
            finally {
                this.thinking = false;
            }
        }
        await this.execute(p);
        this.afterAction(name);
        this.nextGap = rand(2500, 6000);
        this.lastDecisionAt = this.now();
    }
    // ----- Goals & theory-of-mind ---------------------------------------------
    adoptGoal(kind, priority, durationMs, detail) {
        // Replace any existing goal of the same kind
        this.goals = this.goals.filter((g) => g.kind !== kind);
        this.goals.push({ id: `${kind}-${this.now()}`, kind, priority: clamp(priority), until: this.now() + durationMs, detail });
        // Keep only top 3 by priority
        this.goals.sort((a, b) => b.priority - a.priority);
        if (this.goals.length > 3)
            this.goals.length = 3;
    }
    updateGoals(_dt) {
        const t = this.now();
        this.goals = this.goals.filter((g) => g.until > t);
        const lim = this.chem();
        const moodV = lim ? ((lim.moodValence != null) ? lim.moodValence : (lim.emotion === "HAPPY" || lim.emotion === "EXCITED" ? 0.4 : lim.emotion === "SAD" || lim.emotion === "FEARFUL" ? -0.4 : 0)) : 0;
        // Curiosity → explore
        if (this.curiosity > 0.7 && !this.goals.some((g) => g.kind === "explore")) {
            this.adoptGoal("explore", 0.5 + 0.35 * this.curiosity, 28000);
        }
        // Lonely → social (stronger if mood is low)
        if (this.social > 0.65 && !this.personPresent() && !this.goals.some((g) => g.kind === "social")) {
            this.adoptGoal("social", 0.5 + 0.35 * this.social + (moodV < -0.15 ? 0.15 : 0), 22000);
        }
        // Bored + toys → play
        if (this.boredom > 0.65 && this.freeToy() && !this.goals.some((g) => g.kind === "play")) {
            this.adoptGoal("play", 0.48 + 0.35 * this.boredom, 20000);
        }
        // Company + good mood → mild social goal (stay engaged)
        if (this.personPresent() && moodV > 0.15 && this.userModel.friendliness > 0.1 && !this.goals.some((g) => g.kind === "social")) {
            this.adoptGoal("social", 0.4, 12000);
        }
        // Stress / fear / sadness → rest or avoid
        if (lim && (lim.nm.cortisol > 0.42 || lim.emotion === "FEARFUL" || lim.emotion === "SAD" || moodV < -0.35)) {
            if (!this.goals.some((g) => g.kind === "rest" || g.kind === "avoid")) {
                this.adoptGoal(lim.emotion === "FEARFUL" ? "avoid" : "rest", 0.55 + 0.2 * lim.nm.cortisol, 16000);
            }
        }
        // Neural investigate instinct
        if (lim?.instinct === "INVESTIGATE" && (lim.instinctConfidence ?? 0) > 0.5) {
            this.adoptGoal("investigate", 0.48 + 0.35 * (lim.instinctConfidence ?? 0.5), 14000);
        }
        // Fatigue → rest goal
        if (this.fatigue > 0.55 && !this.goals.some((g) => g.kind === "rest")) {
            this.adoptGoal("rest", 0.45 + 0.4 * this.fatigue, 15000);
        }
    }
    updateUserModel(kind) {
        const um = this.userModel;
        const t = this.now();
        um.recentActs.push({ act: kind, at: t });
        if (um.recentActs.length > 24)
            um.recentActs = um.recentActs.slice(-24);
        switch (kind) {
            case "praise":
                um.friendliness = clamp(um.friendliness + 0.12, -1, 1);
                um.trust = clamp(um.trust + 0.08);
                um.attention = clamp(um.attention + 0.15);
                um.mood = clamp(um.mood + 0.15, -1, 1);
                um.inferredGoal = "chat";
                um.patience = clamp(um.patience + 0.05);
                this.adoptGoal("social", 0.55, 10000);
                break;
            case "scold":
                um.friendliness = clamp(um.friendliness - 0.18, -1, 1);
                um.trust = clamp(um.trust - 0.1);
                um.attention = clamp(um.attention + 0.1);
                um.mood = clamp(um.mood - 0.2, -1, 1);
                um.inferredGoal = "alone";
                um.patience = clamp(um.patience - 0.08);
                // Human-like: withdraw briefly after being scolded
                this.adoptGoal("rest", 0.7, 12000);
                this.intention = null; // drop current plan
                break;
            case "talk":
                um.attention = clamp(um.attention + 0.2);
                um.predictability = clamp(um.predictability + 0.03);
                um.mood = clamp(um.mood + 0.04, -1, 1);
                um.inferredGoal = "chat";
                um.patience = clamp(um.patience + 0.02);
                break;
            case "ignore":
                um.attention = clamp(um.attention - 0.08);
                um.friendliness = clamp(um.friendliness - 0.03, -1, 1);
                um.inferredGoal = "alone";
                um.patience = clamp(um.patience - 0.06);
                break;
            case "gift":
                um.friendliness = clamp(um.friendliness + 0.1, -1, 1);
                um.trust = clamp(um.trust + 0.06);
                um.mood = clamp(um.mood + 0.12, -1, 1);
                um.inferredGoal = "play";
                break;
            case "presence":
                um.attention = clamp(um.attention + 0.04);
                if (um.inferredGoal === "alone")
                    um.inferredGoal = "unknown";
                break;
        }
        // Predictability from consistency of recent acts
        if (um.recentActs.length >= 4) {
            const last = um.recentActs.slice(-6).map((a) => a.act);
            const unique = new Set(last).size;
            um.predictability = clamp(0.2 + 0.15 * (6 - unique), 0, 1);
        }
        um.lastAct = kind;
    }
    /** Record a mutually known fact (e.g. person's name) for ToM / dialogue. */
    noteSharedKnowledge(fact) {
        const f = fact.trim().slice(0, 80);
        if (!f)
            return;
        if (!this.userModel.sharedKnowledge.includes(f)) {
            this.userModel.sharedKnowledge.push(f);
            if (this.userModel.sharedKnowledge.length > 20) {
                this.userModel.sharedKnowledge = this.userModel.sharedKnowledge.slice(-20);
            }
        }
    }
    /** Snapshot of the human model (for UI / prompts). */
    tomState() {
        const um = this.userModel;
        return {
            friendliness: um.friendliness,
            attention: um.attention,
            trust: um.trust,
            mood: um.mood,
            goal: um.inferredGoal,
            patience: um.patience,
            predictability: um.predictability,
            knows: [...um.sharedKnowledge],
        };
    }
    score(a) {
        const { curiosity: c, social: s, boredom: b, valence: v, arousal: ar } = this;
        const company = this.personPresent(), tr = this.memory.long.traits;
        let u;
        const rec = this.partsOut;
        let last = 0;
        const mark = (k) => {
            const w = this.useW ? this.mindW[k] : undefined;
            if (w !== undefined && w !== 1 && Number.isFinite(u))
                u = last + (u - last) * w; // tuned weight for this part of the score
            if (rec)
                rec[k] = (rec[k] ?? 0) + (u - last);
            last = u;
        };
        switch (a) {
            case "wander":
                u = 0.7 * c + 0.2 * b - (company ? 0.35 : 0);
                break;
            case "look_around":
                u = 0.25 + 0.3 * c * (1 - ar) + 0.1 * b;
                break;
            case "dance":
                u = 0.3 * Math.max(0, v) + 0.7 * b + 0.15 * ar - 0.35 + (company ? 0.4 * Math.max(0, v) : 0) + 0.5 * (tr.playful - 0.5);
                break;
            case "rest":
                u = 0.1 + 0.6 * Math.max(0, ar - 0.5) + (v < -0.2 ? 0.3 : 0);
                break;
            case "call_out":
                u = company || this.userRecent(30000) || this.now() - this.lastSpokeAt < 25000 ? -Infinity : 1.1 * Math.max(0, s - 0.45);
                break;
            case "murmur":
                u = this.now() - this.lastSpokeAt < 15000 ? -Infinity : 0.1 + 0.2 * b + 0.15 * s;
                break;
            case "go_home":
                u = (!ARENA_INFINITE && this.distHome() > ARENA * 0.9) ? 5 : -Infinity;
                break;
            case "play":
                u = this.freeToy() ? 0.6 * c + 0.5 * b + 0.4 * (tr.playful - 0.5) : (this.human && b > 0.45 && !this.clock.asleep ? 0.55 * b + 0.4 * (tr.playful - 0.5) - 0.1 : -Infinity);
                break;
            case "watch":
                u = company ? 0.9 + 0.3 * s + 0.3 * (0.5 - tr.shy) - Math.min(0.6, this.presentSecs() / 120) : -Infinity;
                break;
        }
        if (!Number.isFinite(u))
            return u;
        mark("base feelings");
        // hormones: dopamine = wanting, cortisol = stress/withdrawal, oxytocin = company, melatonin = sleep, acetylcholine = attention
        const lim = this.chem();
        const ch = lim?.nm;
        if (ch) {
            const dop = ch.dopamine - 0.1, cor = ch.cortisol - 0.1, oxy = ch.oxytocin - 0.1, mel = ch.melatonin - 0.1, ach = ch.acetylcholine - 0.15;
            if (a === "play")
                u += 0.8 * dop - 0.5 * cor;
            if (a === "wander")
                u += 0.6 * dop - 0.6 * cor;
            if (a === "dance")
                u += 0.6 * dop - 0.8 * cor;
            if (a === "look_around")
                u += 0.5 * ach;
            if (a === "watch" || a === "call_out")
                u += 0.6 * oxy;
            if (a === "rest")
                u += 0.8 * mel + 0.7 * cor;
        }
        mark("hormones");
        // Active goals bias the policy (hierarchical control) — stronger shielding
        for (const g of this.goals) {
            const w = 0.7 * g.priority; // was 0.45 — goals now dominate more
            if (g.kind === "explore" && (a === "wander" || a === "look_around"))
                u += w;
            if (g.kind === "social" && (a === "call_out" || a === "watch" || a === "murmur"))
                u += w;
            if (g.kind === "play" && (a === "play" || a === "dance"))
                u += w;
            if (g.kind === "rest" && a === "rest")
                u += w;
            if (g.kind === "avoid" && (a === "rest" || a === "look_around"))
                u += w;
            if (g.kind === "investigate" && (a === "look_around" || a === "wander" || a === "play"))
                u += w;
            // Goal shielding: suppress competing action families when a strong goal is active
            if (g.priority > 0.6) {
                if (g.kind === "rest" && (a === "dance" || a === "play" || a === "wander"))
                    u -= 0.45 * g.priority;
                if (g.kind === "play" && a === "rest")
                    u -= 0.3 * g.priority;
                if (g.kind === "social" && a === "wander")
                    u -= 0.25 * g.priority;
            }
        }
        mark("active goals");
        // Emotional inertia (mood) bias — slow mood from the neural layer
        const limMood = lim?.emotion;
        if (limMood === "SAD" || limMood === "FEARFUL") {
            if (a === "rest" || a === "look_around")
                u += 0.25;
            if (a === "dance" || a === "play" || a === "call_out")
                u -= 0.3;
        }
        else if (limMood === "HAPPY" || limMood === "EXCITED") {
            if (a === "dance" || a === "play" || a === "call_out")
                u += 0.2;
        }
        mark("mood");
        // Fatigue / homeostatic cycle
        if (a === "rest")
            u += 0.9 * this.fatigue;
        if (a === "dance" || a === "play" || a === "wander")
            u -= 0.55 * this.fatigue;
        mark("tiredness");
        // Self-model bias (consistency of personality)
        u += 0.12 * (this.selfModel.playfulBias - 0.5) * (a === "dance" || a === "play" ? 1 : a === "rest" ? -0.5 : 0);
        if (a === "watch" || a === "call_out")
            u += 0.15 * (this.selfModel.socialBattery - 0.5);
        mark("self-image");
        if (this.human) {
            u += this.habits.bonus(a, this.clock.hour);
            mark("habit");
            const sk = skyEffect(this.skyNow, this.clock.hour, this.big5().bold);
            if (a === "wander" || a === "dance" || a === "play")
                u -= sk.stayIn;
            if (a === "rest")
                u += 0.5 * sk.stayIn;
            mark("weather");
            const lowB = Math.max(0, 0.35 - this.battery.level) / 0.35;
            if (a === "rest")
                u += 1.2 * lowB;
            if (a === "wander" || a === "dance" || a === "play")
                u -= 0.8 * lowB;
            if (this.onCharger && a === "rest")
                u += 0.6 * (1 - this.battery.level);
            mark("battery");
            if (this.pain.level > 0.2) {
                if (a === "rest")
                    u += 0.5 * this.pain.level;
                if (a === "dance" || a === "play")
                    u -= 0.5 * this.pain.level;
            }
            mark("pain");
        }
        // Theory-of-mind: inferred goals, mood, trust, patience modulate social policy
        const um = this.userModel;
        if (a === "watch" || a === "call_out") {
            u += 0.35 * um.friendliness + 0.25 * um.attention + 0.2 * (um.trust - 0.4);
            if (um.inferredGoal === "chat")
                u += 0.25;
            if (um.inferredGoal === "alone")
                u -= 0.35;
            if (um.patience < 0.35)
                u -= 0.2;
        }
        if (a === "dance" || a === "play") {
            u += 0.2 * um.friendliness - 0.25 * Math.max(0, -um.friendliness);
            if (um.inferredGoal === "play")
                u += 0.35;
            if (um.mood < -0.2)
                u -= 0.25;
        }
        if (a === "rest" && (um.inferredGoal === "alone" || um.patience < 0.3))
            u += 0.2;
        if (a === "murmur" && um.sharedKnowledge.length > 0 && um.attention > 0.4)
            u += 0.12;
        mark("reading the person");
        // Strong coupling to the emotional brain's current instinct
        // (this is how the neural decision layer steers high-level behaviour)
        if (lim?.instinct) {
            const inst = lim.instinct.toUpperCase();
            const boost = 0.55 * (lim.instinctConfidence ?? 0.5);
            if (inst === "APPROACH" || inst === "GREET") {
                if (a === "watch" || a === "call_out" || a === "play")
                    u += boost;
            }
            else if (inst === "INVESTIGATE") {
                if (a === "look_around" || a === "wander" || a === "play")
                    u += boost;
            }
            else if (inst === "FLEE" || inst === "FREEZE" || inst === "WITHDRAW") {
                if (a === "rest" || a === "look_around")
                    u += boost;
                if (a === "dance" || a === "play" || a === "call_out")
                    u -= boost;
            }
            else if (inst === "CONFRONT") {
                if (a === "dance" || a === "call_out")
                    u += boost * 0.6;
            }
        }
        mark("emotional-brain instinct");
        // experience: what has worked before, overall and in this exact situation
        u += 0.18 * (this.memory.long.actionValue[a] ?? 0) + 0.28 * (this.memory.long.ctxValue[this.ctxKey(a)] ?? 0);
        mark("what worked before");
        // Episodic memory bias — recent good experiences with similar actions nudge him back
        const eps = this.memory.episodes;
        if (eps.length) {
            let epBoost = 0;
            for (let i = eps.length - 1; i >= Math.max(0, eps.length - 12); i--) {
                const e = eps[i];
                if (e.salience < 0.3)
                    continue;
                if ((a === "play" || a === "dance") && (e.kind === "played" || e.detail.includes("danc")))
                    epBoost += 0.08 * e.valence * e.salience;
                if (a === "watch" && e.kind === "saw" && e.detail.includes("person"))
                    epBoost += 0.06 * Math.max(0, e.valence) * e.salience;
                if (a === "wander" && e.kind === "discovered")
                    epBoost += 0.05 * e.salience;
                if (a === "rest" && e.valence < -0.2)
                    epBoost += 0.04 * e.salience;
            }
            u += clamp(epBoost, -0.35, 0.45);
        }
        mark("recent memories");
        // Favorite action slight preference (personality consistency)
        if (this.memory.long.favorite === a)
            u += 0.12;
        // Stronger anti-repetition so he doesn't loop the same action
        if (this.recent[0] === a)
            u -= 0.55;
        else if (this.recent[1] === a)
            u -= 0.28;
        else if (this.recent.includes(a))
            u -= 0.12;
        // When someone is present, suppress aimless wandering (smarter social presence)
        if (this.personPresent() && a === "wander")
            u -= 0.4;
        if (this.personPresent() && a === "call_out")
            u -= 0.5; // already have company
        // Curiosity toward interesting arena objects when bored
        if ((a === "play" || a === "wander" || a === "look_around") && this.boredom > 0.4) {
            const toys = this.body.getWorld().filter((o) => o.kind === "toy");
            if (toys.length) {
                const best = Math.max(...toys.map((t) => this.objectPref[t.id] ?? 0));
                u += 0.15 * best + 0.08 * toys.length * 0.1;
            }
        }
        mark("habits & variety");
        // ---- human-like layer: body clock, personality, hurt feelings, turn-taking
        if (this.human) {
            const sl = this.clock.sleepiness(), en = this.clock.energy();
            if (a === "dance" || a === "play" || a === "wander")
                u -= 0.8 * (1 - en);
            if (a === "rest")
                u += 1.3 * Math.max(0, sl - 0.4);
            u += traitBias(this.big5(), a);
            if (this.sulking()) {
                const g = this.rel.ensure(this.who(), this.now()).grudge;
                if (a === "watch" || a === "call_out")
                    u -= 0.9 * g;
                if (a === "dance")
                    u -= 0.5 * g;
                if (a === "rest" || a === "look_around")
                    u += 0.4 * g;
            }
            if (a === "murmur" && this.userRecent(2500))
                return -Infinity; // don't talk over a person
        }
        mark("body & personality");
        if (this.useW && (this.residual.enabled || this.netPolicy.enabled) && Number.isFinite(u)) {
            const nowT = this.now();
            if (this.learnedAt !== nowT || !this.learnedState) {
                this.learnedState = this.stateVec();
                this.learnedAt = nowT;
            }
            u += this.residual.adj(a, this.learnedState) + this.netPolicy.adj(a, this.learnedState);
            mark("learned");
        }
        return u;
    }
    /** An active intention picks the action; otherwise maybe start a new one. */
    fromPlan() {
        const now = this.now();
        if (!this.planner.current) {
            const sn = this.opts.getSenses?.();
            const toy = this.freeToy();
            const it = this.planner.propose({
                now, rng: Math.random, curiosity: this.curiosity, boredom: this.boredom, social: this.social, valence: this.valence, arousal: this.arousal, fatigue: this.fatigue,
                sleepiness: this.clock.sleepiness(), phase: this.clock.phase(), personPresent: sn?.personPresent === true, sulking: this.sulking(),
                freeToy: toy ? toy.id.replace(/^toy_/, "").replace(/_/g, " ") : undefined, userName: this.memory.long.userName,
            });
            if (it) {
                this.thought = `Plan: ${it.goal}. ${it.reason}`;
                this.event("thought", `new plan: ${it.goal} (${it.steps.map((x) => x.action).join(" > ")})`);
            }
        }
        for (let guard = 0; guard < 6; guard++) {
            const step = this.planner.peek();
            if (!step)
                return null;
            const a = step.action;
            if (!ACTIONS.includes(a) || !Number.isFinite(this.score(a))) {
                this.planner.advance(step.action, now);
                continue;
            } // can't do this step right now: skip it
            this.stepSay = step.say;
            this.stepAlts = step.alts;
            this.planNote = this.planner.current ? this.planner.current.goal : "";
            this.dsrc = "plan";
            this.trace = `plan "${this.planNote}" -> ${a}`;
            return a;
        }
        return null;
    }
    lastDecisionInfo() { return this.lastDecision; }
    /** Record the raw (unweighted) score parts of every action he could have picked, for offline tuning. */
    logChoice(chosen, scored, w, tot, T) {
        const saveRec = this.partsOut, saveW = this.useW;
        this.useW = false;
        const actions = {};
        try {
            for (const x of scored) {
                this.partsOut = {};
                this.score(x.a);
                actions[x.a] = roundRec(this.partsOut);
            }
        }
        finally {
            this.partsOut = saveRec;
            this.useW = saveW;
        }
        const idx = scored.findIndex((x) => x.a === chosen);
        const t = { t: Math.round(this.now()), src: this.dsrc, state: this.stateVec(), chosen, pLog: idx >= 0 ? Math.round((w[idx] / tot) * 1e4) / 1e4 : 0, temp: Math.round(T * 1e4) / 1e4, actions };
        this.mindLog.add(t);
        return t;
    }
    /** Pick the next action and record how and why (timing, scores, what the winner's score is made of). */
    choose() {
        const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
        this.dsrc = "scored";
        this.dtemp = 0;
        this.dcommit = 0;
        const a = this.chooseInner();
        const ms = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
        const scored = ACTIONS.map((x) => ({ a: x, u: this.score(x) })).filter((x) => Number.isFinite(x.u)).sort((x, y) => y.u - x.u);
        const T = this.dtemp || Math.max(0.06, Math.min(0.32, this.exploreTemp));
        const w = scored.map((x) => Math.exp((x.u - (scored[0]?.u ?? 0)) / T));
        const tot = w.reduce((q, x) => q + x, 0) || 1;
        this.partsOut = {};
        this.score(a);
        const parts = Object.entries(this.partsOut).map(([label, v]) => ({ label, v })).filter((x) => Math.abs(x.v) > 0.005).sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
        this.partsOut = null;
        const own = scored.find((x) => x.a === a);
        try {
            this.pendingTick = this.logChoice(a, scored, w, tot, T);
        }
        catch {
            this.pendingTick = null;
        } // logging must never break a decision
        this.lastDecision = {
            at: this.now(), action: a, source: this.dsrc, ms,
            scores: scored.slice(0, 5).map((x, i) => ({ a: x.a, u: x.u, p: w[i] / tot })),
            parts, gap: scored.length > 1 && own ? own.u - scored.filter((x) => x.a !== a)[0].u : 0, temp: T, commitMs: this.dcommit,
        };
        return a;
    }
    chooseInner() {
        const now = this.now();
        if (this.human) {
            const planned = this.fromPlan();
            if (planned)
                return planned;
        }
        // Stick with current intention when still confident (behavioural coherence)
        if (this.intention && this.intention.until > now) {
            const still = this.score(this.intention.action);
            if (Number.isFinite(still) && still > -0.5) {
                this.dsrc = "commitment";
                this.trace = `commit ${this.intention.action} (${still.toFixed(2)})`;
                return this.intention.action;
            }
            this.intention = null;
        }
        const scored = ACTIONS.map((a) => ({ a, u: this.score(a) })).filter((x) => Number.isFinite(x.u));
        if (!scored.length)
            return "look_around";
        this.trace = [...scored].sort((x, y) => y.u - x.u).slice(0, 3).map((x) => `${x.a} ${x.u.toFixed(2)}`).join(" · ");
        const max = Math.max(...scored.map((x) => x.u));
        // Lower temperature when a clear winner exists → smarter, less random
        const ranked = [...scored].sort((x, y) => y.u - x.u);
        const gap = ranked.length > 1 ? ranked[0].u - ranked[1].u : 1;
        const temp = Math.max(0.06, Math.min(0.32, this.exploreTemp * (gap < 0.25 ? 1.15 : 0.85)));
        this.dtemp = temp;
        const w = scored.map((x) => Math.exp((x.u - max) / temp));
        let r = Math.random() * w.reduce((s, x) => s + x, 0);
        let pick = scored[0].a;
        for (let i = 0; i < scored.length; i++) {
            r -= w[i];
            if (r <= 0) {
                pick = scored[i].a;
                break;
            }
        }
        // Commit to the choice for 4–12 s so behaviour doesn't twitch
        const commitMs = 4000 + Math.min(8000, Math.max(0, ranked[0].u) * 6000);
        this.dcommit = commitMs;
        this.intention = { action: pick, until: now + commitMs, confidence: clamp(ranked[0].u / 2) };
        return pick;
    }
    /**
     * Explore on purpose: look at 8 headings, prefer the one leading to a place he hasn't been
     * (his memory of visited cells), avoid the arena edge, and don't turn more than needed.
     */
    planWander(ms) {
        const p = this.body.getPose(), cells = new Set(this.memory.long.cells);
        let best = { rel: 0, score: -Infinity };
        for (const rel of [-135, -90, -45, 0, 45, 90, 135, 180]) {
            const h = ((p.headingDeg + rel) * Math.PI) / 180;
            const tx = p.x + Math.sin(h) * 10 * p.unit, tz = p.z + Math.cos(h) * 10 * p.unit;
            const key = `${Math.floor(tx / (p.unit * CELL))},${Math.floor(tz / (p.unit * CELL))}`;
            const edge = !ARENA_INFINITE && Math.hypot(tx, tz) / p.unit > ARENA * 0.85;
            const score = (this.opts.smartExplore === false ? 0 : cells.has(key) ? 0 : 1) - (edge ? 2 : 0) - (Math.abs(rel) / 180) * 0.3 + Math.random() * 0.5;
            if (score > best.score)
                best = { rel, score };
        }
        const instr = [];
        if (best.rel !== 0)
            instr.push(exec("FACE", p.headingDeg + best.rel), sleep(Math.abs(best.rel) / 420 * 1000 + 120));
        instr.push(exec("WALK_FORWARD"), sleep(ms), stopAll());
        return { instr, effect: "wander" };
    }
    /** No toy to play with? He invents a small game: spin, zigzag, or pace out a square. */
    soloGame() {
        const p = this.body.getPose(), u = p.unit, h = (p.headingDeg * Math.PI) / 180;
        const at = (deg, dist) => `${(p.x + Math.sin(h + (deg * Math.PI) / 180) * dist * u).toFixed(1)},${(p.z + Math.cos(h + (deg * Math.PI) / 180) * dist * u).toFixed(1)},${(0.6 * u).toFixed(1)}`;
        const games = [
            { id: "spin", say: ["Wheee, spinning!", "Let's see how fast I can turn."], instr: [exec("TURN_LEFT", 450), exec("TURN_LEFT", 450), exec("TURN_LEFT", 450), exec("TURN_LEFT", 450), exec("TURN_RIGHT", 450), exec("TURN_RIGHT", 450)], why: "I'm bored with no toy, so I'm spinning around for fun." },
            { id: "zigzag", say: ["Zig, zag, zig!", "Can I walk a zigzag?"], instr: [exec("GOTO", at(35, 5)), exec("GOTO", at(-35, 10)), exec("GOTO", at(35, 15)), stopAll()], why: "I'm bored with no toy, so I'm walking a zigzag." },
            { id: "square", say: ["Let me pace out a square.", "One, two, three, four sides."], instr: [exec("GOTO", at(0, 6)), exec("GOTO", at(90, 8)), exec("GOTO", at(180, 8)), exec("GOTO", at(270, 8)), stopAll()], why: "I'm bored with no toy, so I'm pacing out a square." },
            { id: "wiggle", say: ["Wiggle wiggle!", "Dance break!"], instr: [exec("DANCE"), sleep(2200), stopAll()], why: "I'm bored with no toy, so I'm doing a little wiggle." },
        ];
        const g = games[Math.floor(Math.random() * games.length)];
        return { instr: g.instr, say: Math.random() < 0.6 ? pick(g.say) : undefined, reason: g.why, label: "game: " + g.id, effect: "play" };
    }
    plan(a) {
        const name = this.memory.long.userName;
        const u = this.body.getPose().unit;
        switch (a) {
            case "wander": {
                const ins = this.human ? this.inspectQ.shift() : undefined;
                if (ins)
                    return { instr: [exec("GOTO", `${ins.x},${ins.z},${2.6 * u}`), sleep(500), exec("TURN_LEFT", 500), exec("TURN_RIGHT", 900), exec("EYE_SET", 60), sleep(500), exec("EYE_CENTER")], say: this.fresh([`Let me look at the ${ins.label} properly.`, `What is this ${ins.label}?`, `Ooh, I want a closer look at the ${ins.label}.`]), reason: `I haven't looked closely at the ${ins.label} yet, so I'm going to inspect it.`, label: "inspect", effect: "wander" };
                return { ...this.planWander(rand(2500, 6000)), reason: `Restless (curiosity ${pct(this.curiosity)}), so I'm going to explore.` };
            }
            case "look_around": return { instr: [exec("EYE_SET", rand(30, 80)), sleep(800), exec("EYE_SET", rand(100, 150)), sleep(900), exec("EYE_CENTER")], reason: "Quietly checking my surroundings.", effect: a };
            case "dance": return { instr: [exec("DANCE"), sleep(rand(4000, 7000)), stopAll()], say: this.fresh(["I feel like dancing!", "Music in my head!", "I can't stand still!", "This mood needs movement."]), reason: `Feeling ${this.mood()} — dancing feels right.`, effect: a };
            case "rest": return { instr: [stopAll(), exec("EYE_SET", 60), sleep(7000), exec("EYE_CENTER")], say: this.fresh(["Taking a quiet moment.", "Just resting for a bit.", "Ahh. Quiet.", "I need a pause."]), reason: `Feeling ${this.mood()} — resting.`, effect: a };
            case "call_out": return {
                instr: [exec("EYE_LEFT", 25), sleep(600), exec("EYE_RIGHT", 50), sleep(600), exec("EYE_CENTER")],
                say: name ? this.fresh([`${name}? Are you there?`, `Hey ${name}, I'm over here.`]) : this.fresh(["Hello? Is anyone there?", "I could use some company.", "It's so quiet in here."]),
                reason: `No company for a while (social need ${pct(this.social)}), so I'm calling out.`, effect: a
            };
            case "murmur": {
                const recall = Math.random() < 0.45 ? ((this.human ? this.rel.recall(this.who(), this.now(), Math.random) : null) ?? this.recallLine()) : null;
                return { instr: [], say: recall ?? this.fresh(MURMURS[this.mood()] ?? MURMURS.calm), reason: recall ? "Remembering something from earlier." : `Thinking out loud, feeling ${this.mood()}.`, effect: a };
            }
            case "go_home": return { instr: [exec("GOTO", `0,0,${3 * u}`)], say: "I've wandered far. Heading back.", reason: "Too close to the arena edge, so I'm heading back to the middle.", effect: "wander" };
            case "watch": {
                const seen = this.opts.getSenses?.().seen ?? [];
                const lab = seen.find((x) => x.label === "person" || x.label === "someone")?.label ?? seen[0]?.label ?? "someone";
                return { instr: [sleep(rand(3000, 5000))], say: Math.random() < 0.2 ? pick(["I like having company.", "What are you up to?", "Still here?"]) : undefined,
                    reason: `${lab === "person" || lab === "someone" ? "Someone is here" : "I can see " + (/^[A-Z]/.test(lab) ? lab : "a " + lab)}, so I'm keeping my eyes on them.`, label: "watch", effect: a };
            }
            case "play": {
                const toy = this.preferredToy() ?? this.freeToy();
                if (!toy)
                    return this.human ? this.soloGame() : this.plan("look_around");
                const nice = toy.id.replace(/^toy_/, "").replace(/_/g, " ");
                return {
                    instr: [exec("GOTO", `${toy.x},${toy.z},${2.2 * u}`), exec("DANCE"), sleep(1800), stopAll()],
                    say: Math.random() < 0.55 ? this.fresh([`The ${nice} one!`, `Found the ${nice} toy.`, "This looks fun.", "Coming for you!"]) : undefined,
                    reason: `I'm going to play with the ${nice} toy.`,
                    effect: a,
                };
            }
        }
    }
    /** Run a plan, then let consequences change drives and learn from how it felt. */
    async execute(plan) {
        this.acting++;
        try {
            this.lastAction = plan.label ?? plan.effect ?? "idle";
            if (plan.effect)
                this.recent = [plan.effect, ...this.recent].slice(0, 3);
            this.event("action", plan.label ?? plan.reason);
            if (plan.say) {
                plan.say = this.softSay(plan.say) ?? plan.say;
                this.event("speech", plan.say);
                this.lastSpokeAt = this.now();
            }
            const b = this.needs(), v0 = this.valence, ctx0 = this.ctxKey("");
            if (plan.effect === "rest")
                this.feel("sleep");
            await this.body.act(plan.instr, plan.say);
            if (plan.effect === "rest")
                this.feel("wake");
            if (plan.effect === "dance")
                this.feel("danced");
            // Homeostatic fatigue: activity raises it, rest lowers it
            if (plan.effect === "rest")
                this.fatigue = Math.max(0, this.fatigue - 0.22);
            else if (plan.effect === "dance" || plan.effect === "play")
                this.fatigue = Math.min(1, this.fatigue + 0.12);
            else if (plan.effect === "wander")
                this.fatigue = Math.min(1, this.fatigue + 0.06);
            else
                this.fatigue = Math.max(0, this.fatigue - 0.01);
            // Slow self-model update from experience
            if (plan.effect === "dance" || plan.effect === "play")
                this.selfModel.playfulBias = clamp(this.selfModel.playfulBias + 0.02, 0.2, 0.85);
            if (plan.effect === "watch" || plan.effect === "call_out")
                this.selfModel.socialBattery = clamp(this.selfModel.socialBattery - 0.03, 0.15, 0.95);
            if (plan.effect === "rest")
                this.selfModel.socialBattery = clamp(this.selfModel.socialBattery + 0.05, 0.15, 0.95);
            let novel = false;
            if (plan.effect) {
                novel = this.applyEffects(plan.effect);
                const a = this.needs();
                const reward = (this.valence - v0) + 0.5 * ((b.c - a.c) + (b.b - a.b) + (b.s - a.s));
                const old = this.memory.long.actionValue[plan.effect] ?? 0;
                this.memory.long.actionValue[plan.effect] = clamp(old + 0.2 * (reward - old), -1, 1);
                const ck = ctx0 + plan.effect, oc = this.memory.long.ctxValue[ck] ?? 0;
                this.memory.long.ctxValue[ck] = clamp(oc + 0.3 * (reward - oc), -1, 1);
                this.memory.remember(plan.effect, plan.reason, reward, clamp(0.25 + Math.abs(reward) + (novel ? 0.4 : 0)));
                // Learn which toys he likes
                if (plan.effect === "play") {
                    const toy = this.preferredToy() ?? this.freeToy();
                    if (toy) {
                        const prev = this.objectPref[toy.id] ?? 0;
                        this.objectPref[toy.id] = clamp(prev + 0.15 * reward + 0.05, -0.5, 1);
                    }
                }
                // Teach the neural layer with the same behavioural outcome so both
                // levels of intelligence stay aligned.
                this.opts.onOutcome?.(reward);
                if (this.pendingTick && this.pendingTick.chosen === plan.effect) {
                    if (this.residual.enabled)
                        this.residual.learn(plan.effect, this.pendingTick.state, reward);
                    this.mindLog.finish(this.pendingTick, reward, this.stateVec());
                    this.pendingTick = null;
                }
                if (this.human) {
                    driftTraits(this.big5(), { action: plan.effect, reward });
                    this.habits.note(plan.effect, this.clock.hour, reward);
                    this.curEffect = plan.effect;
                    this.curEffectAt = this.now();
                    this.lastDid = { dance: "danced like that", play: "played with a toy", wander: "wandered about", look_around: "looked around" }[plan.effect] ?? "";
                    this.lastDidAt = this.now();
                    if (this.personPresent() && reward > 0.1 && ["dance", "play", "watch"].includes(plan.effect))
                        this.rel.record(this.who(), "fun", plan.effect === "watch" ? "we spent time together" : `I ${plan.effect === "dance" ? "danced" : "played"} while you watched`, reward, 0.5, this.now());
                }
            }
            this.journal.push(plan.reason.slice(0, 100));
            if (this.journal.length > 8)
                this.journal.shift();
        }
        finally {
            this.acting--;
            this.lastDecisionAt = this.now();
            this.emit();
        }
    }
    applyEffects(a) {
        let novel = false;
        switch (a) {
            case "wander": {
                this.curiosity = clamp(this.curiosity - 0.2);
                this.boredom = clamp(this.boredom - 0.3);
                const p = this.body.getPose();
                const key = `${Math.floor(p.x / (p.unit * CELL))},${Math.floor(p.z / (p.unit * CELL))}`;
                const cells = this.memory.long.cells;
                if (!cells.includes(key)) {
                    cells.push(key);
                    if (cells.length > 400)
                        cells.shift();
                    novel = true;
                    this.curiosity = clamp(this.curiosity - 0.2);
                    this.valence = clamp(this.valence + 0.2, -1, 1);
                    this.arousal = clamp(this.arousal + 0.15);
                    this.memory.remember("discovered", `a new place (${key})`, 0.4, 0.8);
                    this.event("memory", `discovered a new place (${key})`);
                    this.feel("discovered");
                }
                this.checkToys();
                break;
            }
            case "look_around":
                this.curiosity = clamp(this.curiosity - 0.08);
                this.boredom = clamp(this.boredom - 0.12);
                break;
            case "dance":
                this.boredom = clamp(this.boredom - 0.5);
                this.valence = clamp(this.valence + 0.15, -1, 1);
                this.arousal = clamp(this.arousal + 0.2);
                break;
            case "rest":
                this.arousal = clamp(this.arousal - 0.2);
                this.valence = clamp(this.valence + 0.05, -1, 1);
                break;
            case "play":
                this.checkToys();
                break;
            case "watch":
                this.social = clamp(this.social - 0.15);
                this.boredom = clamp(this.boredom - 0.1);
                this.valence = clamp(this.valence + 0.05, -1, 1);
                break;
            case "call_out":
                this.social = clamp(this.social - 0.1);
                break;
            case "murmur":
                this.boredom = clamp(this.boredom - 0.1);
                this.social = clamp(this.social - 0.05);
                break;
            default: break;
        }
        return novel;
    }
    checkToys() {
        for (const o of this.body.getWorld()) {
            if (o.kind !== "toy" || this.distTo(o.x, o.z) > 3.5 || (this.toyCooldown.get(o.id) ?? 0) > this.now())
                continue;
            this.toyCooldown.set(o.id, this.now() + 45000);
            this.boredom = clamp(this.boredom - 0.4);
            this.curiosity = clamp(this.curiosity - 0.15);
            this.valence = clamp(this.valence + 0.25, -1, 1);
            this.arousal = clamp(this.arousal + 0.2);
            this.memory.remember("played", o.id, 0.5, 0.75);
            this.event("memory", `played with ${o.id}`);
            this.feel("played", o.id);
        }
    }
    // ----- helpers
    brainReport() {
        const l = this.chem();
        if (!l)
            return undefined;
        return { emotion: l.emotion.toLowerCase(), intensity: Math.round(l.intensity * 100) / 100, because: l.because, instinct: l.instinct.toLowerCase(),
            hormones: Object.fromEntries(CHEMS.map((c) => [c.label, Math.round(l.nm[c.id] * 100)])) };
    }
    chemSummary() {
        const nm = this.chem()?.nm;
        if (!nm)
            return undefined;
        return Object.fromEntries(CHEMS.map((c) => [c.label.toLowerCase(), { level: Math.round(nm[c.id] * 100), over: nm[c.id] - c.base, role: c.role }]));
    }
    feel(kind, detail) { this.opts.onFeel?.(kind, detail); }
    chem() { return this.opts.getChem?.(); }
    personPresent() { return this.opts.getSenses?.().personPresent === true; }
    presentSecs() { return this.personSince ? (this.now() - this.personSince) / 1000 : 0; }
    ctxKey(a) { return `${this.mood()}|${this.personPresent() ? "watched" : "alone"}|${a}`; }
    /** Habituation: each repeat of a stimulus counts for less, and it recovers while nothing happens. Returns the current strength. */
    habituate(kind) { const f = this.habit[kind] ?? 1; this.habit[kind] = Math.max(0.25, f * 0.8); return f; }
    /** Say something short (cooldown-limited) without disturbing whatever the body is doing. */
    react(text, force = false) {
        if (!force && this.now() - this.lastSpokeAt < 6000)
            return;
        this.lastSpokeAt = this.now();
        this.event("speech", text);
        void this.body.act([], text);
    }
    reflex(instr) { if (!this.body.isBusy() && this.acting === 0)
        void this.body.act(instr); }
    async say(text) { this.event("speech", text); this.lastSpokeAt = this.now(); await this.body.act([], text); }
    event(t, text) {
        if (t === "speech") {
            this.spoken.push(text);
            if (this.spoken.length > 12)
                this.spoken.shift();
            this.convoPush("you", text);
        }
        this.evLog.push({ t: this.now(), type: t, text });
        if (this.evLog.length > 240)
            this.evLog.shift();
        this.opts.onEvent?.(t, text);
    }
    needs() { return { c: this.curiosity, b: this.boredom, s: this.social }; }
    userRecent(ms) { return this.now() - this.lastUserAt < ms; }
    distTo(x, z) { const p = this.body.getPose(); return Math.hypot(x - p.x, z - p.z) / p.unit; }
    distHome() { return this.distTo(0, 0); } // distance from the arena center
    freeToy() {
        const toys = this.body.getWorld().filter((o) => o.kind === "toy" && (this.toyCooldown.get(o.id) ?? 0) <= this.now());
        return toys.sort((a, b) => this.distTo(a.x, a.z) - this.distTo(b.x, b.z))[0];
    }
    /** Prefer toys he has liked before, then nearest. */
    preferredToy() {
        const toys = this.body.getWorld().filter((o) => o.kind === "toy" && (this.toyCooldown.get(o.id) ?? 0) <= this.now());
        if (!toys.length)
            return undefined;
        return toys.sort((a, b) => {
            const pa = this.objectPref[a.id] ?? 0, pb = this.objectPref[b.id] ?? 0;
            if (Math.abs(pb - pa) > 0.05)
                return pb - pa;
            return this.distTo(a.x, a.z) - this.distTo(b.x, b.z);
        })[0];
    }
    resolveTarget(t) {
        const u = this.body.getPose().unit;
        if (t === "home" || t === "center")
            return { x: 0, z: 0, stop: 3 * u };
        const o = this.body.getWorld().find((w) => w.id === t);
        return o ? { x: o.x, z: o.z, stop: (o.r ?? 0) + 2.2 * u } : null;
    }
    willing(dance) {
        const fam = Math.min(1, this.memory.long.interactions / 20);
        let w = 0.55 + 0.35 * this.valence + 0.15 * fam + (dance ? 0.25 * this.boredom : 0.1 * this.curiosity) + (Math.random() - 0.5) * 0.2;
        if (this.human) {
            w += 0.2 * (this.big5().agreeable - 0.5) - 0.3 * this.clock.sleepiness();
            if (this.sulking())
                w -= 0.5 * this.rel.ensure(this.who(), this.now()).grudge + 0.1;
            driftTraits(this.big5(), { event: w > 0.45 ? "obeyed" : "refused" });
        }
        return w > 0.45;
    }
    /** Who he is with. Relationships are kept per name ("you" until he learns it). */
    /** The tiny involuntary movements for this frame (blink, tilt, glance, startle, stumble). Zero when the human-like layer is off. */
    microFrame(dt, walking, dancing) {
        if (!this.human) {
            this.micro.events.length = 0;
            return { tilt: 0, yaw: 0, squash: 0, hop: 0, lean: 0 };
        }
        const now = this.now();
        const o = this.micro.update(dt, {
            asleep: this.clock.asleep, walking, dancing, listening: this.userRecent(5000), thinking: now < this.thinkingUntil,
            arousal: this.arousal, sleepiness: this.clock.sleepiness(),
        });
        while (this.micro.events.length) {
            const e = this.micro.events.shift();
            if (e === "stumble") {
                this.event("system", "tripped a little");
                this.jokes.add("tripped over my own feet", this.now());
                if (!this.clock.asleep && Math.random() < 0.7)
                    this.react(pick(["Oops!", "Whoa, I tripped.", "Ha, clumsy me."]));
                this.valence = clamp(this.valence - 0.03, -1, 1);
            }
        }
        return o;
    }
    /** He is about to answer: for `ms` he glances away and back, like someone thinking. */
    markThinking(ms) { this.thinkingUntil = this.now() + ms; }
    who() {
        // a recognised face beats "the person who told me their name"; stale after 90 s without seeing them
        if (this.currentPerson && this.now() - this.currentPersonAt < 90000)
            return this.currentPerson;
        return this.memory.long.userName ?? "you";
    }
    /** Vision was taught a face name: carry over what he remembered about the unnamed person. */
    learnPersonName(name) {
        if (!this.human)
            return;
        const prev = this.who();
        if (prev.toLowerCase() !== name.toLowerCase())
            this.rel.rename(prev, name, this.now());
        this.rel.ensure(name, this.now());
        this.currentPerson = name;
        this.currentPersonAt = this.now();
    }
    currentPersonName() { return this.who(); }
    /** "Forget me": erase what he remembers about this person (default: whoever he is with). */
    forgetPerson(name) {
        const who = name ?? this.who();
        const had = this.rel.forget(who);
        if (this.memory.long.userName?.toLowerCase() === who.toLowerCase()) {
            this.memory.long.userName = undefined;
            this.memory.long.facts = {};
            this.memory.save();
        }
        if (this.currentPerson?.toLowerCase() === who.toLowerCase())
            this.currentPerson = null;
        this.topicMem = new TopicMemory([]);
        this.memory.long.topics = [];
        this.memory.long.asked = [];
        this.memory.long.fuzzy = [];
        this.memory.long.factAt = {};
        this.gifts.items = this.gifts.items.filter((g) => g.from.toLowerCase() !== who.toLowerCase());
        this.presence.leave(who);
        this.saveLife();
        this.event("memory", `forgot ${who}`);
        this.emit();
        return had;
    }
    /** Stretch or shrink the simulated day (real minutes per simulated 24 hours). */
    setDayLength(realMinutes) { this.clock.minutesPerSec = 1440 / (Math.max(1, realMinutes) * 60); this.event("system", `a day now lasts ${realMinutes} real minutes`); }
    /** Everything the human layer wants to keep, as one JSON document (saved to the database per user). */
    exportState() {
        const m = this.memory.long;
        return {
            v: 1, savedAt: this.now(), clock: this.clock.state(), relationships: this.rel.map, big5: this.big5(), traits: m.traits,
            userName: m.userName, facts: m.facts, lessons: m.lessons.slice(-20), actionValue: m.actionValue, interactions: m.interactions, favorite: m.favorite, goals: m.goals ?? [], moodCarry: this.moodCarry, life: (this.saveLife(), m.life), stats: m.stats, milestones: m.milestones ?? {}, factAt: m.factAt ?? {}, fuzzy: m.fuzzy ?? [], topics: this.topicMem.items, quirk: m.quirk, asked: m.asked ?? [],
        };
    }
    /** Load a saved state if it is newer than what this browser has. Returns true when it was used. */
    importState(st, localStateAt = 0) {
        if (!st || st.v !== 1 || typeof st.savedAt !== "number" || st.savedAt <= localStateAt)
            return false;
        const m = this.memory.long;
        if (st.relationships && typeof st.relationships === "object")
            this.rel.map = st.relationships;
        this.rel.save();
        if (st.big5)
            m.big5 = { ...m.big5, ...st.big5 };
        if (st.traits)
            m.traits = { ...m.traits, ...st.traits };
        if (typeof st.userName === "string")
            m.userName = st.userName;
        if (st.facts && typeof st.facts === "object")
            m.facts = { ...m.facts, ...st.facts };
        if (Array.isArray(st.lessons))
            m.lessons = [...new Set([...m.lessons, ...st.lessons])].slice(-20);
        if (st.actionValue)
            m.actionValue = { ...m.actionValue, ...st.actionValue };
        m.interactions = Math.max(m.interactions, st.interactions ?? 0);
        if (Array.isArray(st.goals) && st.goals.length >= (m.goals?.length ?? 0))
            m.goals = st.goals;
        if (typeof st.moodCarry === "number")
            this.moodCarry = st.moodCarry;
        if (st.life && typeof st.life === "object") {
            this.loadLife(st.life);
            this.saveLife();
        }
        if (st.stats && typeof st.stats === "object") {
            const a = this.stats();
            for (const k of Object.keys(a))
                a[k] = Math.max(a[k], Number(st.stats[k]) || 0);
        }
        if (st.milestones && typeof st.milestones === "object")
            m.milestones = { ...st.milestones, ...(m.milestones ?? {}) };
        if (st.factAt && typeof st.factAt === "object")
            m.factAt = { ...st.factAt, ...(m.factAt ?? {}) };
        if (Array.isArray(st.fuzzy))
            m.fuzzy = [...new Set([...(m.fuzzy ?? []), ...st.fuzzy])].filter((k) => !(k in m.facts));
        if (Array.isArray(st.topics)) {
            const have = new Set(this.topicMem.items.map((x) => x.id + x.at));
            const all = [...this.topicMem.items, ...st.topics.filter((x) => x && x.id && !have.has(x.id + x.at))].sort((a, b) => a.at - b.at).slice(-12);
            this.topicMem = new TopicMemory(all);
            m.topics = this.topicMem.items;
        }
        if (typeof st.quirk === "string" && !m.quirk)
            m.quirk = st.quirk;
        if (Array.isArray(st.asked))
            m.asked = [...new Set([...(m.asked ?? []), ...st.asked])];
        if (st.clock && typeof st.clock.minutes === "number") {
            this.clock.minutes = st.clock.minutes;
            this.clock.pressure = st.clock.pressure ?? this.clock.pressure;
            this.clock.asleep = !!st.clock.asleep;
            this.clock.advance(Math.min(1200, Math.max(0, (this.now() - st.savedAt) / 1000))); // time passed since it was saved
        }
        this.memory.save();
        this.saveClock();
        this.event("system", "restored saved mind from your account");
        this.emit();
        return true;
    }
    sulking() { return this.human && this.rel.sulking(this.who(), this.now()); }
    sleepiness() { return this.human ? this.clock.sleepiness() : 0; }
    big5() { return this.memory.long.big5; }
    /** Body language for the 3D model: slump, breathing, walking speed, dance energy. */
    posture() {
        if (!this.human)
            return { slump: 0, breath: 0.45, speed: 1, energy: 1, eyeBase: 90 };
        return postureFor({ mood: this.mood(), sleepiness: this.clock.sleepiness(), asleep: this.clock.asleep, sulking: this.sulking(), fatigue: this.fatigue });
    }
    setHuman(on) { this.human = on; this.planner.reset(); this.event("system", `human-like layer: ${on ? "on" : "off"}`); this.emit(); }
    mood() {
        if (this.human) {
            if (this.clock.asleep)
                return "asleep";
            if (this.clock.sleepiness() > 0.72)
                return "sleepy";
            if (this.sulking())
                return "sad";
        }
        const lim = this.chem();
        if (lim?.asleep)
            return "sleepy";
        if (lim && lim.intensity > 0.45) {
            const m = { HAPPY: "happy", EXCITED: "excited", CURIOUS: "curious", SURPRISED: "startled", FEARFUL: "afraid", ANGRY: "angry", DISGUSTED: "disgusted", SAD: "sad", PAIN: "hurt" };
            if (m[lim.emotion])
                return m[lim.emotion];
        }
        if (this.arousal > 0.55 && this.valence > 0.3)
            return "excited";
        if (this.arousal > 0.55 && this.valence < -0.1)
            return "startled";
        if (this.personPresent() && this.arousal > 0.3)
            return "attentive";
        if (this.social > 0.75 && this.valence < 0.1)
            return "lonely";
        if (this.boredom > 0.7)
            return "bored";
        if (this.curiosity > 0.65)
            return "curious";
        if (this.valence > 0.2)
            return "content";
        return "calm";
    }
    snapshot() {
        return {
            mode: this.mode, mood: this.mood(), valence: this.valence, arousal: this.arousal,
            curiosity: this.curiosity, social: this.social, boredom: this.boredom,
            thought: this.thought, lastAction: this.lastAction, interactions: this.memory.long.interactions,
            userName: this.memory.long.userName, favorite: this.memory.long.favorite,
            ...(this.human ? { person: this.currentPerson ?? undefined, clock: this.clock.clockText(), phase: this.clock.phase(), sleepiness: this.clock.sleepiness(), asleep: this.clock.asleep, plan: this.planner.describe(), sulking: this.sulking(), traits: { ...this.big5() } } : {}),
        };
    }
    emit() { this.opts.onUpdate?.(this.snapshot()); }
}
function due0(tm, now) { return tm.due(now); }
