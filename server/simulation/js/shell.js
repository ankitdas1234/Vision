/**
 * Vision — simulation shell.
 *
 * Hosts three views in iframes and the Compiler <-> Autonomous toggle switch:
 *   compiler    ./compiler/     Vision Script editor + pipeline + playback on the 3D robot
 *   autonomous  ./autonomous/   the robot's simulated mind (brain, mood, drives, arena)
 *   voice       ./voice/        talk to Vision: wake-word commands (no AI), music, AI for open questions
 *   live        ./live/         the server's virtual robot (talk to the real brain)
 *
 * The Compiler/Autonomous choice is a UI choice for the SIMULATOR ONLY. It is kept in the
 * server's memory (GET/POST /api/simulation/mode, pushed over the SSE stream as a `mode`
 * event) so the dashboard's Simulation page and this page always agree. Nothing here can
 * reach the real robot: those endpoints answer 409 in ROBOT_MODE=hardware.
 *
 * Not logged in / server unreachable: the toggle still works, locally, and says so.
 */
const $ = (id) => document.getElementById(id);
const els = {
  sw: $("modeSwitch"), lblC: $("lblCompiler"), lblA: $("lblAutonomous"), ovChip: $("ovChip"), ovName: $("ovName"),
  sync: $("sync"), syncText: $("syncText"), notice: $("notice"),
  frames: { compiler: $("frameCompiler"), autonomous: $("frameAutonomous"), voice: $("frameVoice"), live: $("frameLive") },
};

const MODES = ["compiler", "autonomous"];
const STORE_KEY = "vision.sim.mode";

let mode = "compiler";      // the synced mode
let overlay = null;         // local-only tab on top of the synced mode: null | "voice" | "live"
let serverOk = false;       // can we reach /api/simulation/mode?

function readStored() { try { const v = localStorage.getItem(STORE_KEY); return MODES.includes(v) ? v : null; } catch { return null; } }
function writeStored(v) { try { localStorage.setItem(STORE_KEY, v); } catch { /* private mode */ } }

function setSync(kind, text, title = "") {
  els.sync.className = "sync " + kind;
  els.syncText.textContent = text;
  els.sync.title = title;
}
function notice(html, tone = "") {
  els.notice.className = "notice show " + tone;
  els.notice.innerHTML = html;
}
function clearNotice() { els.notice.className = "notice"; }

/**
 * Frames load lazily the first time they are shown. Only the Compiler stays mounted while hidden
 * (its script and playback position are worth keeping). Autonomous, Voice and Live are UNLOADED
 * as soon as you leave them: a hidden iframe is still a running page, so it would keep its mind
 * loop, speech, music, microphone and camera going in the background.
 */
const KEEP_MOUNTED = new Set(["compiler"]);

function ensureLoaded(name) {
  const f = els.frames[name];
  if (f.getAttribute("src") !== f.dataset.src) f.setAttribute("src", f.dataset.src);
}

/**
 * The Autonomous page wires the shell's mind controls (Off/Local/AI, face model, LLM, ?, E-STOP — same ids)
 * every time it loads. When it is unloaded, swap them for fresh copies so the dead page's handlers don't pile up.
 */
function resetMindControls() {
  for (const id of ["mindLeft", "mindRight"]) { const n = $(id); if (n) n.replaceWith(n.cloneNode(true)); }
  const es = $("estop"); if (es) { es.classList.remove("armed"); es.textContent = "E-STOP"; es.setAttribute("aria-label", "Emergency stop"); es.title = "Emergency stop (Esc)"; }
  const lb = $("llmBadge"); if (lb) { lb.className = "badge"; const sp = lb.querySelector("span"); if (sp) sp.textContent = "LLM: checking…"; }
}

/** The Compiler stays mounted while hidden, so just make it quiet: pause playback, stop speech and music. */
function silenceCompiler() {
  try {
    const w = els.frames.compiler.contentWindow;
    w.VisionSim?.pause?.();
    w.VisionSim?.stopMusic?.();
    w.speechSynthesis?.cancel();
    w.document.querySelectorAll("audio, video").forEach((m) => m.pause());
  } catch { /* not loaded yet */ }
}

function unload(name) {
  const f = els.frames[name];
  if (!f.getAttribute("src") || f.getAttribute("src") === "about:blank") return; // never loaded / already unloaded
  try {
    const w = f.contentWindow;
    w.speechSynthesis?.cancel();                                                  // stop any voice mid-sentence
    w.document.querySelectorAll("audio, video").forEach((m) => { m.pause(); m.srcObject = null; });
  } catch { /* cross-origin or already gone: navigating away below stops it anyway */ }
  // Navigating away fires the page's own `pagehide` (the Autonomous view saves its mind there),
  // destroys its timers and releases the mic / camera.
  f.setAttribute("src", "about:blank");
  if (name === "autonomous") resetMindControls();
}

function render() {
  const visible = overlay ?? mode;
  for (const [name, f] of Object.entries(els.frames)) {
    const on = name === visible;
    const wasOn = f.classList.contains("on");
    if (on) ensureLoaded(name);
    else if (!KEEP_MOUNTED.has(name)) unload(name);
    else if (wasOn) silenceCompiler(); // leaving the Compiler view
    f.classList.toggle("on", on);
  }
  // the Autonomous-only controls (mind mode, face model, LLM, help, E-STOP) show only while that view is up
  $("bar").classList.toggle("mind-on", visible === "autonomous");
  els.sw.setAttribute("aria-checked", String(mode === "autonomous"));
  els.lblC.classList.toggle("on", !overlay && mode === "compiler");
  els.lblA.classList.toggle("on", !overlay && mode === "autonomous");
  els.ovChip.hidden = !overlay;
  els.ovName.textContent = overlay === "live" ? "Live link" : "Voice";
  document.title = `Vision — Simulation · ${overlay === "live" ? "Live link" : overlay === "voice" ? "Voice" : mode === "compiler" ? "Compiler" : "Autonomous"}`;
}

/** Apply a mode locally (no network). */
function applyMode(next) {
  if (!MODES.includes(next)) return;
  mode = next;
  writeStored(next);
  render();
}

/** User asked for a mode: apply it now, then tell the server so the dashboard follows. */
async function chooseMode(next) {
  overlay = null;
  applyMode(next);
  if (!serverOk) return;
  els.sw.disabled = true;
  try {
    const res = await fetch("/api/simulation/mode", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: next }),
    });
    if (res.status === 403) {
      setSync("local", "local only", "Your account can't change the shared mode (TRUSTED role or higher). This page still switches.");
    } else if (!res.ok) {
      throw new Error("server " + res.status);
    } else {
      setSync("live", "synced", "Dashboard and simulator share this mode.");
    }
  } catch {
    setSync("bad", "not synced", "Couldn't tell the server. The switch still works on this page.");
  } finally {
    els.sw.disabled = false;
  }
}

els.sw.addEventListener("click", () => chooseMode(mode === "compiler" ? "autonomous" : "compiler"));
els.lblC.addEventListener("click", () => chooseMode("compiler"));
els.lblA.addEventListener("click", () => chooseMode("autonomous"));
els.ovChip.addEventListener("click", () => { overlay = null; render(); });
// The Autonomous page's Capabilities has switches for the Voice and Live link views; they call this.
window.VisionShell = {
  open(name) { if (name === "voice" || name === "live") { overlay = name; render(); } },
  close() { overlay = null; render(); },
};

// Deep links: /simulation/#autonomous  /simulation/#compiler  /simulation/#live
function fromHash() {
  const h = location.hash.replace("#", "");
  if (h === "live" || h === "voice") { overlay = h; return null; }
  return MODES.includes(h) ? h : null;
}
window.addEventListener("hashchange", () => { overlay = null; const h = fromHash(); if (h) applyMode(h); else render(); });

// ---- boot ----------------------------------------------------------------
async function connect() {
  const hashMode = fromHash();
  applyMode(hashMode ?? readStored() ?? "compiler");

  let info;
  try {
    const res = await fetch("/api/system/robot-mode", { credentials: "same-origin" });
    if (res.status === 401) {
      setSync("local", "local only", "Not logged in");
      notice('Not logged in, so the toggle only affects this page. Log in on the Vision dashboard (same address) and <a href="" onclick="location.reload();return false;">reload</a> to sync with it.');
      return;
    }
    info = await res.json();
  } catch {
    setSync("bad", "offline", "Can't reach the Vision server");
    notice("Can't reach the Vision server. The Compiler view still works offline; the Autonomous view's local mind does too.", "bad");
    return;
  }

  if (info.mode !== "simulation") {
    setSync("bad", "hardware mode");
    notice("The server is in hardware mode — it is driving the real robot, so the simulator is disabled. Switch to Simulation on the dashboard's Robot page.", "bad");
    return;
  }

  try {
    const res = await fetch("/api/simulation/mode", { credentials: "same-origin" });
    if (!res.ok) throw new Error("server " + res.status);
    const { mode: serverMode } = await res.json();
    serverOk = true;
    // A deep link wins once and is then pushed to the server; otherwise the server is the truth.
    if (hashMode && hashMode !== serverMode) chooseMode(hashMode); else applyMode(serverMode);
    clearNotice();
    setSync("live", "synced", "Dashboard and simulator share this mode.");
  } catch {
    setSync("local", "local only");
    return;
  }

  const es = new EventSource("/api/simulation/stream?only=mode");
  es.addEventListener("mode", (e) => {
    try { const { mode: m } = JSON.parse(e.data); if (m !== mode) applyMode(m); } catch { /* ignore */ }
  });
  es.onerror = () => setSync("local", "reconnecting…");
  es.onopen = () => setSync("live", "synced", "Dashboard and simulator share this mode.");
}

connect();