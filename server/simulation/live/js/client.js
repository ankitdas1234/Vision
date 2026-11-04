/**
 * Vision — 3D simulator client.
 *
 * This page does NOT run a robot. The server (ROBOT_MODE=simulation) runs the
 * real brain, the real Vision Script compiler and the real command pipeline,
 * and its virtual robot (server/src/robot/SimulatedRobot.ts) sits where the
 * ESP32 would. This client:
 *
 *   1. listens to  GET  /api/simulation/stream  and draws that robot (Rig),
 *   2. speaks any text the robot "says" (AUDIO_SPEAK) with the browser's voice,
 *   3. sends what you say / type to  POST /api/simulation/say  — the same
 *      conversation pipeline the real robot's microphone feeds.
 *
 * You must be logged in (the dashboard's session cookie is shared, same origin).
 */
const protoBanner = document.getElementById("protoBanner");
if (location.protocol === "file:") {
  protoBanner.classList.add("show");
  throw new Error("Open this page through the Vision server (http://localhost:4000/simulation/), not as a local file.");
}

if (typeof window.THREE === "undefined") {
  document.getElementById("modelLoading").textContent = "Couldn't load the 3D engine (vendor/three.min.js). Reload the page.";
  throw new Error("THREE is not defined — vendor/three.min.js did not load.");
}

const { Rig } = await import("./rig.js");
const { createSpeechController } = await import("./speech.js");

const $ = (id) => document.getElementById(id);
const els = {
  micBtn: $("micBtn"), micIcon: $("micIcon"), caption: $("caption"), bodyState: $("bodyState"), notice: $("notice"),
  supportWarning: $("supportWarning"), fallbackToggle: $("fallbackToggle"), keyboardToggle: $("keyboardToggle"),
  fallbackForm: $("fallbackForm"), fallbackText: $("fallbackText"),
  hudMode: $("hudMode"), hudHead: $("hudHead"), hudLeft: $("hudLeft"), hudRight: $("hudRight"),
  hudHeading: $("hudHeading"), hudUltra: $("hudUltra"), hudCmd: $("hudCmd"),
};

// ---- inline mic icons (no icon-font download) ----------------------------
const MIC_ON = '<path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" fill="currentColor"/>';
const MIC_OFF = '<path d="M19 11h-2a5 5 0 0 1-.6 2.4l1.5 1.5A7 7 0 0 0 19 11ZM15 11V6a3 3 0 0 0-5.9-.8L15 11.1V11ZM4.3 3 3 4.3l6 6V11a3 3 0 0 0 4.3 2.7l1.5 1.5A5 5 0 0 1 7 11H5a7 7 0 0 0 6 6.92V21h2v-3.08c.8-.1 1.5-.35 2.2-.7l4.5 4.5 1.3-1.3L4.3 3Z" fill="currentColor"/>';
els.micIcon.innerHTML = MIC_OFF;

// ---- small helpers ----------------------------------------------------------
const history = [];
function notice(html, tone = "") {
  els.notice.className = "notice show " + tone;
  els.notice.innerHTML = html;
}
function clearNotice() { els.notice.className = "notice"; }
function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

let captionTimer = null;
function showCaption(role, text) {
  clearTimeout(captionTimer);
  els.caption.className = "caption show " + role;
  els.caption.innerHTML = `<span class="who">${role === "user" ? "You" : "Vision"}</span>${escapeHtml(text)}`;
  captionTimer = setTimeout(() => els.caption.classList.remove("show"), role === "user" ? 2600 : 5200);
}

// Don't say the same sentence twice when it arrives both on the stream (AUDIO_SPEAK)
// and in the /say reply.
const recentlySpoken = new Map();
function speakOnce(text) {
  const now = Date.now();
  for (const [t, at] of recentlySpoken) if (now - at > 4000) recentlySpoken.delete(t);
  if (!text || recentlySpoken.has(text)) return;
  recentlySpoken.set(text, now);
  speech.speak(text, {});
}

// ---- HUD + body label from the server's state ----------------------------
const legText = (leg) => (!leg || leg.direction === "STOP" ? "stopped" : `${leg.direction.toLowerCase()} ${leg.speed}%`);
function bodyLabel(s) {
  if (s.emergencyStopped) return "E-STOP";
  const l = s.leftLeg.direction, r = s.rightLeg.direction;
  if (l === "STOP" && r === "STOP") return "Idle";
  if (l !== "STOP" && r !== "STOP" && l !== r) return "Turning";
  if (l === "REVERSE" || r === "REVERSE") return "Backing up";
  return "Walking";
}
function renderHud(s) {
  els.hudHead.textContent = `${Math.round(s.headPhysicalAngle)}° (→ ${s.headAngle}°)`;
  els.hudLeft.textContent = legText(s.leftLeg);
  els.hudRight.textContent = legText(s.rightLeg);
  els.hudHeading.textContent = `${Math.round(s.pose.headingDeg)}°  (${s.pose.x.toFixed(2)}, ${s.pose.z.toFixed(2)} m)`;
  els.hudUltra.textContent = `${s.ultrasonicMm} mm`;
  els.hudCmd.textContent = s.lastCommand ? s.lastCommand.type : "—";
  els.bodyState.textContent = bodyLabel(s);
}
function onState(s) {
  Rig.applyState(s);
  renderHud(s);
}

// ---- talking to the real brain ---------------------------------------------
async function sendToServer(text) {
  showCaption("user", text);
  try {
    const res = await fetch("/api/simulation/say", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.status === 401) return needLogin();
    if (res.status === 403) { showCaption("assistant", "Your account can't command the robot (TRUSTED role or higher needed)."); return; }
    if (!res.ok) throw new Error("server responded " + res.status);
    const data = await res.json();
    const replies = (data.replies || []).map((r) => r.text).filter(Boolean);
    if (replies.length) {
      showCaption("assistant", replies.join(" "));
      replies.forEach(speakOnce);
    } else if (!data.acted) {
      showCaption("assistant", data.intent && data.intent.type === "UNKNOWN" ? "I didn't catch a command in that." : "…");
    }
  } catch (err) {
    console.error(err);
    showCaption("assistant", "Sorry, I couldn't reach the server.");
  }
}

function needLogin() {
  notice('You need to be logged in. Log in on the Vision dashboard (same address), then <a href="" onclick="location.reload();return false;">reload this page</a>.', "warn");
  els.hudMode.textContent = "not logged in";
}

// ---- attentive-listening nudge (cosmetic head wobble while you speak) ----
let nudgeActive = false, nudgeRaf = null, interimTimer = null;
function startNudge() {
  if (nudgeActive) return;
  nudgeActive = true;
  const start = performance.now();
  const step = (now) => {
    if (!nudgeActive) { Rig.setIdleNudge(0); return; }
    Rig.setIdleNudge(Math.sin(((now - start) / 1000) * 3.2) * 12);
    nudgeRaf = requestAnimationFrame(step);
  };
  nudgeRaf = requestAnimationFrame(step);
}
function stopNudge() { nudgeActive = false; if (nudgeRaf) cancelAnimationFrame(nudgeRaf); Rig.setIdleNudge(0); }

const speech = createSpeechController({
  onInterim: () => { startNudge(); clearTimeout(interimTimer); interimTimer = setTimeout(stopNudge, 900); },
  onFinal: (text) => { stopNudge(); sendToServer(text); },
  onListeningChange: (listening) => {
    els.micBtn.classList.toggle("live", listening);
    els.micIcon.innerHTML = listening ? MIC_ON : MIC_OFF;
  },
});

if (!speech.supported) {
  els.supportWarning.style.display = "block";
  els.micBtn.disabled = true;
  els.fallbackForm.classList.add("show");
  els.keyboardToggle.style.display = "none";
}
els.micBtn.addEventListener("click", () => (speech.isListening() ? speech.stopListening() : speech.startListening()));
function toggleFallback() {
  els.fallbackForm.classList.toggle("show");
  if (els.fallbackForm.classList.contains("show")) els.fallbackText.focus();
}
els.keyboardToggle.addEventListener("click", toggleFallback);
els.fallbackToggle?.addEventListener("click", toggleFallback);
els.fallbackForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = els.fallbackText.value.trim();
  if (!text) return;
  els.fallbackText.value = "";
  sendToServer(text);
});

// ---- boot: check mode + login, then open the live stream -------------------
async function connect() {
  let modeInfo;
  try {
    const res = await fetch("/api/system/robot-mode", { credentials: "same-origin" });
    if (res.status === 401) return needLogin();
    modeInfo = await res.json();
  } catch {
    notice("Can't reach the Vision server. Is it running?", "bad");
    els.hudMode.textContent = "offline";
    return setTimeout(connect, 3000);
  }

  if (modeInfo.mode !== "simulation") {
    notice("The server is in <b>hardware mode</b> — it is driving the real robot, so there is nothing to simulate. Switch to Simulation on the dashboard's Robot page.", "warn");
    els.hudMode.textContent = "hardware mode";
    return;
  }

  const es = new EventSource("/api/simulation/stream");
  es.addEventListener("hello", (e) => { clearNotice(); els.hudMode.textContent = "live"; els.hudMode.classList.add("live"); onState(JSON.parse(e.data)); });
  es.addEventListener("state", (e) => onState(JSON.parse(e.data)));
  es.addEventListener("speech", (e) => { const { text } = JSON.parse(e.data); showCaption("assistant", text); speakOnce(text); });
  es.onerror = () => {
    els.hudMode.textContent = "reconnecting…";
    els.hudMode.classList.remove("live");
  };
}

Rig.ready.then(connect).catch(() => notice("The 3D model failed to load.", "bad"));
