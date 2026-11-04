if (location.protocol === "file:") {
  document.getElementById("protoBanner").classList.add("show");
  throw new Error("Open this page through the Vision server (http://localhost:4000/simulation/), not as a local file.");
}

if (typeof window.THREE === "undefined") {
  document.getElementById("modelLoading").textContent =
    "Couldn't load the 3D engine (three.js from cdnjs.cloudflare.com). Check your internet connection or whether something is blocking that domain, then reload.";
  throw new Error("THREE is not defined — the three.js CDN script did not load.");
}

const { Rig } = await import("./rig.js");
const { createSpeechController } = await import("./speech.js");

const els = {
  micBtn: document.getElementById("micBtn"),
  micIcon: document.getElementById("micIcon"),
  statusDot: document.getElementById("statusDot"),
  statusText: document.getElementById("statusText"),
  caption: document.getElementById("caption"),
  bodyState: document.getElementById("bodyState"),
  llmBadge: document.getElementById("llmBadge"),
  supportWarning: document.getElementById("supportWarning"),
  fallbackToggle: document.getElementById("fallbackToggle"),
  keyboardToggle: document.getElementById("keyboardToggle"),
  fallbackForm: document.getElementById("fallbackForm"),
  fallbackText: document.getElementById("fallbackText"),
};

const DURATIONAL_DEFAULT = { TURN_LEFT: 600, TURN_RIGHT: 600, WALK_FORWARD: 800, WALK_BACKWARD: 800, DANCE: 3000 };
const history = []; // { role, content }[]
const MAX_HISTORY = 8;

let busyExecuting = false; // true while a command sequence is playing
let idleTimer = null;
let musicAudio = null; // HTMLAudioElement for PLAY_MUSIC
let standingLabel = "Idle"; // what the body is doing between commands: Idle / Walking / Dancing / E-STOP

function stopMusic() {
  if (musicAudio) {
    try { musicAudio.pause(); musicAudio.currentTime = 0; } catch (_) {}
    musicAudio = null;
  }
}

function playMusic(url) {
  stopMusic();
  if (!url || typeof url !== "string") return;
  // Only play https audio from the licensed catalogues (Jamendo, Apple previews); the server checks this too
  let host = "";
  try { const u = new URL(url); host = u.protocol === "https:" ? u.hostname : ""; } catch (_) { /* invalid */ }
  const okHosts = ["jamendo.com", "itunes.apple.com", "mzstatic.com", "apple.com"];
  if (!okHosts.some((d) => host === d || host.endsWith("." + d))) {
    console.warn("PLAY_MUSIC blocked untrusted URL:", url);
    return;
  }
  musicAudio = new Audio(url);
  musicAudio.volume = 0.9;
  musicAudio.play().catch((err) => console.error("Music play failed:", err));
  musicAudio.onended = () => {
    musicAudio = null;
    if (els.bodyState && els.bodyState.textContent === "Playing music") {
      els.bodyState.textContent = "Idle";
    }
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function setStatus(text, tone) {
  if (els.statusText) els.statusText.textContent = text;
  if (els.statusDot) els.statusDot.className = "dot" + (tone ? " " + tone : "");
}

// ---- caption bubble (the entire "conversation" UI) -------------------------
let captionTimer = null;
function showCaption(role, text) {
  clearTimeout(captionTimer);
  els.caption.className = "caption show " + role;
  els.caption.innerHTML = `<span class="who">${role === "user" ? "You" : "Vision"}</span>${escapeHtml(text)}`;
  captionTimer = setTimeout(() => els.caption.classList.remove("show"), role === "user" ? 2600 : 5200);
}
function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function pushHistory(role, content) {
  history.push({ role, content });
  while (history.length > MAX_HISTORY) history.shift();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Plays a list of {op:'EXEC'|'SLEEP', ...} instructions against the rig,
 *  in order, awaiting each one's natural duration — mirrors the compiler
 *  project's simulator playback loop, minus the debug UI around it. */
async function executeInstructions(instructions) {
  if (!instructions || !instructions.length) return;
  busyExecuting = true;
  if (els.bodyState) els.bodyState.textContent = "Acting…";

  for (const instr of instructions) {
    if (instr.op === "SLEEP") {
      await delay(instr.ms);
      continue;
    }

    const { command, arg } = instr;
    let holdMs = 0;

    switch (command) {
      case "EYE_CENTER": Rig.setEyeAngle(90); break;
      case "EYE_SET": if (typeof arg === "number") Rig.setEyeAngle(clamp(arg, 0, 180)); break;
      case "EYE_LEFT": Rig.setEyeAngle(clamp(Rig.getEyeAngle() - (typeof arg === "number" ? arg : 15), 0, 180)); break;
      case "EYE_RIGHT": Rig.setEyeAngle(clamp(Rig.getEyeAngle() + (typeof arg === "number" ? arg : 15), 0, 180)); break;

      case "TURN_LEFT":
      case "TURN_RIGHT": {
        holdMs = typeof arg === "number" ? arg : DURATIONAL_DEFAULT[command];
        const delta = command === "TURN_LEFT" ? -90 : 90;
        Rig.setBodyTurn(Rig.getBodyTurn() + delta); // keep new heading (no snap-back)
        await delay(holdMs);
        break;
      }

      case "WALK_FORWARD": {
        // Keep walking until WALK_STOP / "Vision, stop" — no auto timeout
        Rig.setDancing(false);
        Rig.setWalking(true, 1);
        standingLabel = "Walking";
        if (els.bodyState) els.bodyState.textContent = "Walking";
        break;
      }

      case "WALK_BACKWARD": {
        // Turn 180° from current heading, then walk forward in the new direction
        Rig.setDancing(false);
        Rig.setWalking(false);
        Rig.setBodyTurn(Rig.getBodyTurn() + 180);
        if (els.bodyState) els.bodyState.textContent = "Turning…";
        await delay(600);
        Rig.setWalking(true, 1);
        standingLabel = "Walking";
        if (els.bodyState) els.bodyState.textContent = "Walking";
        break;
      }

      case "WALK_STOP":
        Rig.setWalking(false);
        Rig.setDancing(false);
        standingLabel = "Idle";
        if (els.bodyState) els.bodyState.textContent = "Idle";
        break;

      case "DANCE": {
        // Keep dancing until WALK_STOP / "Vision, stop"
        Rig.setWalking(false);
        Rig.setDancing(true);
        standingLabel = "Dancing";
        if (els.bodyState) els.bodyState.textContent = "Dancing";
        break;
      }

      case "EMERGENCY_STOP":
        Rig.setStopped(true);
        Rig.setWalking(false);
        Rig.setDancing(false);
        standingLabel = "E-STOP";
        if (els.bodyState) els.bodyState.textContent = "E-STOP";
        break;

      case "EMERGENCY_CLEAR":
        Rig.setStopped(false);
        standingLabel = "Idle";
        if (els.bodyState) els.bodyState.textContent = "Idle";
        break;

      case "AUDIO_SPEAK":
        // Speech is handled separately (see speakAndAct) so it can overlap
        // with movement; this tag alone just leaves a short beat.
        await delay(300);
        break;

      case "PLAY_MUSIC": {
        if (typeof arg === "string" && arg) {
          playMusic(arg);
          if (els.bodyState) els.bodyState.textContent = "Playing music";
        }
        break;
      }

      case "STOP_MUSIC": {
        stopMusic();
        break;
      }

      default:
        break;
    }
  }

  busyExecuting = false;
  // Continuous actions (walk/dance) keep their label until stop
  if (els.bodyState && els.bodyState.textContent === "Acting…") {
    els.bodyState.textContent = standingLabel;
  }
}

let lastAssistantReply = "";
let lastAssistantReplyTime = 0;
let isSending = false;

function isEchoOfAssistant(text) {
  if (!lastAssistantReply) return false;
  // Acoustic echo from speakers only happens during or immediately after speech
  if (Date.now() - lastAssistantReplyTime > 6000) return false;

  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const cleanInput = normalize(text);
  const cleanReply = normalize(lastAssistantReply);

  if (!cleanInput || !cleanReply) return false;

  // 1. Exact match
  if (cleanInput === cleanReply) return true;

  // 2. Substring match within 6s of assistant speaking
  if (cleanInput.length >= 8 && cleanReply.includes(cleanInput)) return true;
  if (cleanReply.length >= 8 && cleanInput.includes(cleanReply)) return true;

  // 3. Word overlap: if at least 2 words and >70% overlap
  const inputWords = cleanInput.split(" ").filter((w) => w.length > 2);
  const replyWords = new Set(cleanReply.split(" ").filter((w) => w.length > 2));
  if (inputWords.length >= 2) {
    const matched = inputWords.filter((w) => replyWords.has(w)).length;
    if (matched / inputWords.length >= 0.7) return true;
  }

  return false;
}

/** Speaks the reply out loud while the command sequence plays concurrently,
 *  awaiting both so state stays clean. */
function speakAndAct(replyText, instructions, speech) {
  const runMovement = executeInstructions(instructions);
  const speechPromise = new Promise((resolve) => {
    speech.speak(replyText, { onEnd: resolve });
  });
  return Promise.all([runMovement, speechPromise]);
}

// Songs left in the current search ("next song" plays the next one; no server call needed).
let musicQueue = [];
const NEXT_SONG = /^(?:(?:hey |hi |ok |okay )?vision[,!]?\s+)?(?:next(?: song| track| one)?|skip(?: this| the)?(?: song| track)?|play (?:another|something else)(?: one| song)?|another (?:song|one))[.!?]*$/i;
const SAFE_HOSTS = ["jamendo.com", "itunes.apple.com", "mzstatic.com", "apple.com"];
function safeAudio(u) { try { const x = new URL(u); return x.protocol === "https:" && SAFE_HOSTS.some((d) => x.hostname === d || x.hostname.endsWith("." + d)); } catch (_) { return false; } }

async function sendToServer(message, isDirectUserAction = false) {
  if (isSending) return;
  if (NEXT_SONG.test(message.trim()) && (musicAudio || musicQueue.length)) {
    const nxt = musicQueue.shift();
    const reply = nxt && safeAudio(nxt.audioUrl) ? `Next up: ${nxt.title} by ${nxt.artist}.` : "That's the last one from that search. Tell me another song to play.";
    showCaption("user", message); pushHistory("user", message); showCaption("assistant", reply); pushHistory("assistant", reply);
    if (nxt && safeAudio(nxt.audioUrl)) await speakAndAct(reply, [{ op: "EXEC", command: "PLAY_MUSIC", arg: nxt.audioUrl }], speech);
    else { stopMusic(); await speakAndAct(reply, [], speech); }
    return;
  }
  isSending = true;

  showCaption("user", message);
  pushHistory("user", message);
  setStatus(/^(?:(?:hey |hi |ok |okay )?vision[,!]?\s+)?(?:play|dance to)\s/i.test(message) ? "Finding your song…" : "Thinking…", "warn");

  let replyText = "";
  let instructions = [];

  try {
    const res = await fetch("/api/simulation/voice/chat", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history }),
    });
    if (res.status === 401) { replyText = "Please log in on the Vision dashboard first, then reload this page."; throw new Error("not logged in"); }
    if (res.status === 403) { replyText = "Your account can't talk to the simulator (TRUSTED role or higher)."; throw new Error("forbidden"); }
    if (res.status === 409) { replyText = "The server is in hardware mode, so the simulator is disabled."; throw new Error("hardware mode"); }
    if (res.status === 429) { replyText = "That's a lot of requests, give me a moment."; throw new Error("rate limited"); }
    if (!res.ok) throw new Error("server responded " + res.status);
    const data = await res.json();
    replyText = data.reply || "…";
    instructions = data.instructions || [];
    musicQueue = data.music && Array.isArray(data.music.queue) ? data.music.queue.filter((q) => q && safeAudio(q.audioUrl)) : (data.music ? [] : musicQueue);
    if (data.music && data.music.audioUrl) {
      instructions = [...instructions, { op: "EXEC", command: "PLAY_MUSIC", arg: data.music.audioUrl }];
    }
    if (data.source === "ai" && data.model && els.llmBadge) els.llmBadge.textContent = "AI: " + data.model;

    lastAssistantReply = replyText;
    lastAssistantReplyTime = Date.now();


    showCaption("assistant", replyText);
    pushHistory("assistant", replyText);
  } catch (err) {
    console.error(err);
    if (!replyText) replyText = "Hmm, I had trouble reaching my brain. Try again in a moment!";
    showCaption("assistant", replyText);
    setStatus("Error", "bad");
  } finally {
    // Release the lock as soon as we have a response — speech.isSpeaking()
    // guards against echo during playback so we don't need isSending for that.
    isSending = false;
  }

  // Speak and act outside the isSending lock so the user can queue the next
  // message as soon as the acoustic cooldown ends.
  if (replyText) {
    if (els.bodyState) els.bodyState.textContent = "Speaking…";
    setStatus("Speaking…", "warn");

    // Explicitly disable mic during speaking
    const wasListening = speech.isListening();
    if (wasListening) speech.stopListening();
    els.micBtn.disabled = true;

    await speakAndAct(replyText, instructions, speech);

    els.micBtn.disabled = false;
    if (wasListening) speech.startListening();

    setStatus(speech.isListening() ? "Listening" : "Idle", speech.isListening() ? "good" : null);
    if (els.bodyState) els.bodyState.textContent = musicAudio ? "Playing music" : standingLabel;
  }
}

// ---- "attentive listening" idle reaction ----------------------------------
// While interim (not-yet-final) speech is coming in, gently nudge the eyes
// back and forth so the robot looks like it's reacting to being spoken to —
// but only when it isn't already mid-action from a previous command.
let idleNudgeActive = false;
function startIdleNudge() {
  if (idleNudgeActive || busyExecuting) return;
  idleNudgeActive = true;
  const start = performance.now();
  function step(now) {
    if (!idleNudgeActive) { Rig.setIdleNudge(0); return; }
    const elapsed = (now - start) / 1000;
    Rig.setIdleNudge(Math.sin(elapsed * 3.2) * 12);
    idleTimer = requestAnimationFrame(step);
  }
  idleTimer = requestAnimationFrame(step);
}
function stopIdleNudge() {
  idleNudgeActive = false;
  if (idleTimer) cancelAnimationFrame(idleTimer);
  Rig.setIdleNudge(0);
}

let interimResetTimer = null;
function handleInterim() {
  if (speech.isSpeaking() || isSending) return;
  startIdleNudge();
  clearTimeout(interimResetTimer);
  interimResetTimer = setTimeout(stopIdleNudge, 900); // stop nudging shortly after speech pauses
}

function handleFinal(text) {
  stopIdleNudge();

  const trimmed = text.trim();
  if (!trimmed) return;

  // 1. Never accept input while the robot is speaking or in cooldown
  if (speech.isSpeaking()) {
    console.log("[speech] Dropped input during speaking/cooldown:", trimmed);
    return;
  }

  // 2. Reject self-echo of the robot's own recent output
  if (isEchoOfAssistant(trimmed)) {
    console.log("[speech] Dropped echo of robot output:", trimmed);
    return;
  }

  // 3. Ignore speech if a server request is currently in flight
  if (isSending) {
    console.log("[speech] Dropped input while request in flight:", trimmed);
    return;
  }


  sendToServer(trimmed);
}

const speech = createSpeechController({
  onInterim: handleInterim,
  onFinal: handleFinal,
  onListeningChange: (isListening) => {
    els.micBtn.classList.toggle("live", isListening);
    els.micIcon.className = isListening ? "fa-solid fa-microphone" : "fa-solid fa-microphone-slash";
    if (!busyExecuting && !speech.isSpeaking() && !isSending) {
      setStatus(isListening ? "Listening" : "Idle", isListening ? "good" : null);
    }
  },
});

if (!speech.supported) {
  els.supportWarning.style.display = "block";
  els.micBtn.disabled = true;
  els.fallbackForm.classList.add("show");
  els.keyboardToggle.style.display = "none";
}

els.micBtn.addEventListener("click", () => {
  if (speech.isListening()) {
    speech.stopListening();
    speech.stopSpeaking();
  } else {
    speech.startListening();
  }
});

// Small escape hatch — not a chat log, just an occasional typed message —
// for accessibility or whenever speech recognition misbehaves.
function toggleFallback() {
  els.fallbackForm.classList.toggle("show");
  if (els.fallbackForm.classList.contains("show")) els.fallbackText.focus();
}
els.keyboardToggle?.addEventListener("click", toggleFallback);
els.fallbackToggle?.addEventListener("click", toggleFallback);
els.fallbackForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = els.fallbackText.value.trim();
  if (!text) return;
  els.fallbackText.value = "";
  speech.stopSpeaking();


  sendToServer(text, true);
});

// ---- boot -------------------------------------------------------------
setStatus("Loading model…", "warn");
fetch("/api/simulation/voice/health", { credentials: "same-origin" })
  .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
  .then(({ ai, music }) => {
    if (!els.llmBadge) return;
    els.llmBadge.textContent = ai.configured ? `AI: ${ai.models[0] || "ready"}${ai.models.length > 1 ? ` (+${ai.models.length - 1} backup)` : ""}` : "AI: not set up (commands still work)";
    els.llmBadge.classList.toggle("warn", !ai.configured);
    els.llmBadge.title = music.configured ? "Music: full tracks (Jamendo) + previews" : "Music: 30-second previews. Set JAMENDO_CLIENT_ID for full tracks";
  })
  .catch(() => {
    if (!els.llmBadge) return;
    els.llmBadge.textContent = "Not signed in or server unreachable";
    els.llmBadge.classList.add("warn");
  });

Rig.ready.then(() => setStatus("Idle", null)).catch(() => setStatus("Model failed to load", "bad"));
