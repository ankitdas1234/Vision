#!/usr/bin/env node
// Try the AI mind with YOUR key and see what it costs and how fast it answers.
// Usage:  node scripts/ai-smoke.mjs http://localhost:4100 <session-cookie-value>
// It calls the chat endpoint the Voice page uses (it goes through the same AI router) (POST /api/simulation/voice/chat) a few times and prints latency and the replies.
// Simulation only. Nothing here touches the robot.
const [base = "http://localhost:4100", cookie = ""] = process.argv.slice(2);
const prompts = ["Someone just praised me and the room is bright. What do I say?", "I bumped into a wall and it hurt a bit. What do I say?", "My battery is low and a friend is nearby. What do I say?"];
let total = 0;
for (const p of prompts) {
  const t0 = Date.now();
  const res = await fetch(`${base}/api/simulation/voice/chat`, { method: "POST", headers: { "content-type": "application/json", cookie: `pi_session=${cookie}` }, body: JSON.stringify({ message: p, history: [] }) }).catch((e) => ({ ok: false, status: String(e) }));
  const ms = Date.now() - t0; total += ms;
  const body = res.ok ? await res.text() : "";
  console.log(`${res.ok ? "OK " : "ERR"} ${res.status} ${ms}ms  ${body.slice(0, 160).replace(/\s+/g, " ")}`);
}
console.log(`average ${Math.round(total / prompts.length)} ms per call. Check your provider dashboard for the token cost of these ${prompts.length} calls.`);
