/**
 * Human-like layer for Vision's simulated mind. Pure TypeScript: no DOM, no Node, no AI.
 * Everything here is deterministic given an injected `rng` and clock, so it can be tested.
 *
 *   BodyClock       a simulated day: circadian alertness + sleep pressure -> sleepy, naps, wakes groggy
 *   Planner         short multi-step intentions ("show you the toy") that can be interrupted and resumed
 *   Relationships   per-person trust / warmth / grudge, shared moments, fading + blurring recall, apology & forgiveness
 *   Personality     five slowly drifting traits (curious, sociable, calm, bold, agreeable)
 *   Reflector       daydreams and small insights while idle or asleep
 *   expression      mood -> posture / breathing / speech style (hesitation, yawns, sulking)
 *
 * Honest framing: this models human-like behaviour. It is not real feeling or consciousness.
 */

export type Rng = () => number;
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const pick = <T>(arr: T[], rng: Rng): T => arr[Math.floor(rng() * arr.length) % arr.length];

// ------------------------------------------------------------------ clock --

export type Phase = "morning" | "day" | "evening" | "night";

export interface ClockState { minutes: number; pressure: number; asleep: boolean }

/**
 * A simulated day. `minutesPerSec` sim-minutes pass per (scaled) second, default 1 -> a day lasts 24 real minutes.
 * Sleepiness blends two things people really have: a body clock (alert mid-afternoon, low around 3am)
 * and sleep pressure (builds the longer you are awake, drains while asleep).
 */
export class BodyClock {
  minutes: number;           // 0..1440, time of day
  pressure: number;          // 0..1 sleep pressure
  asleep = false;
  private sleptMin = 0;
  private total = 0;
  private groggyUntil = -1;
  private noSleepUntil = -1;
  private dayCount = 0;
  constructor(public minutesPerSec = 1, start: Partial<ClockState> = {}) {
    this.minutes = start.minutes ?? 8 * 60;
    this.pressure = start.pressure ?? 0.15;
    this.asleep = start.asleep ?? false;
  }

  get hour() { return this.minutes / 60; }
  get days() { return this.dayCount; }

  advance(sec: number) {
    const dm = sec * this.minutesPerSec;
    this.total += dm;
    this.minutes += dm;
    while (this.minutes >= 1440) { this.minutes -= 1440; this.dayCount++; }
    if (this.asleep) { this.pressure = clamp(this.pressure - dm / (8 * 60)); this.sleptMin += dm; }
    else this.pressure = clamp(this.pressure + dm / (16 * 60));
    // natural wake-up: rested, and it is not the middle of the night
    if (this.asleep && this.sleptMin > 4 * 60 && this.pressure < 0.2 && this.alertness() > 0.3) this.wake("rested");
  }

  phase(): Phase {
    const h = this.hour;
    return h >= 5 && h < 11 ? "morning" : h >= 11 && h < 18 ? "day" : h >= 18 && h < 22 ? "evening" : "night";
  }

  /** Body-clock alertness 0..1: peak mid-afternoon, trough in the small hours. */
  alertness() { return 0.5 + 0.5 * Math.cos((2 * Math.PI * (this.hour - 15)) / 24); }

  groggy() { return this.total < this.groggyUntil; }

  /** 0..1, how much he wants to sleep right now. */
  sleepiness() {
    const s = 0.55 * this.pressure + 0.45 * (1 - this.alertness()) + (this.groggy() ? 0.2 : 0);
    return clamp(this.asleep ? Math.max(s, 0.8) : s);
  }

  /** Energy multiplier for lively actions (dance, play, wander). */
  energy() { return clamp(1.15 - 0.9 * this.sleepiness(), 0.15, 1.1); }

  shouldSleep() { return !this.asleep && this.total >= this.noSleepUntil && this.sleepiness() > 0.78 && (this.phase() === "night" || this.pressure > 0.92); }

  sleep() { if (!this.asleep) { this.asleep = true; this.sleptMin = 0; } }

  /** Wake him. A disturbance in the middle of the night leaves him groggy. */
  wake(reason: "rested" | "disturbed") {
    if (!this.asleep) return;
    this.asleep = false;
    if (reason === "disturbed") { this.groggyUntil = this.total + 15; this.noSleepUntil = this.total + 12; } // stays up a little while before dozing off again
  }

  clockText() {
    const h = Math.floor(this.hour), m = Math.floor(this.minutes % 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  state(): ClockState { return { minutes: this.minutes, pressure: this.pressure, asleep: this.asleep }; }
}

// ---------------------------------------------------------------- planner --

export interface PlanStep { action: string; say?: string; /** Alternative wordings; the mind picks one it has not said recently. */ alts?: string[]; maxMs?: number }
export interface Intent {
  id: string; goal: string; reason: string; steps: PlanStep[]; index: number;
  startedAt: number; deadline: number; priority: number;
  suspendedAt?: number; suspendReason?: string;
}

export interface PlanContext {
  now: number; rng: Rng;
  curiosity: number; boredom: number; social: number; valence: number; arousal: number; fatigue: number;
  sleepiness: number; phase: Phase; personPresent: boolean; sulking: boolean;
  freeToy?: string; userName?: string;
}

/** Short multi-step intentions. A plan is chosen on purpose, not scored step by step. */
export class Planner {
  current: Intent | null = null;
  private seq = 0;
  private lastProposalAt = -1e12;
  completed: string[] = [];

  peek(): PlanStep | null {
    const p = this.current;
    return p && !p.suspendedAt && p.index < p.steps.length ? p.steps[p.index] : null;
  }

  describe(): string | undefined {
    const p = this.current;
    if (!p) return undefined;
    return `${p.goal} (step ${Math.min(p.index + 1, p.steps.length)}/${p.steps.length}${p.suspendedAt ? ", paused" : ""})`;
  }

  /** Called after an action ran. Moves to the next step if that was the planned one. */
  advance(action: string, now: number): "next" | "done" | null {
    const p = this.current;
    if (!p || p.suspendedAt) return null;
    const s = p.steps[p.index];
    if (!s || s.action !== action) return null;
    p.index++;
    if (p.index >= p.steps.length) { this.completed.push(p.goal); this.current = null; this.lastProposalAt = now; return "done"; }
    return "next";
  }

  abort(now: number) { this.current = null; this.lastProposalAt = now; }

  /** A strong event pauses the plan. It resumes if the moment passes quickly, otherwise it is dropped. */
  interrupt(reason: string, now: number) { if (this.current && !this.current.suspendedAt) { this.current.suspendedAt = now; this.current.suspendReason = reason; } }

  /** Housekeeping each tick. Returns a message when something changed (for the event log). */
  tick(now: number, calm: boolean): string | null {
    const p = this.current;
    if (!p) return null;
    if (now > p.deadline) { this.abort(now); return `gave up on "${p.goal}" (took too long)`; }
    if (p.suspendedAt) {
      if (now - p.suspendedAt > 25000) { this.abort(now); return `dropped "${p.goal}" after being interrupted (${p.suspendReason})`; }
      if (calm && now - p.suspendedAt > 6000) { p.suspendedAt = undefined; return `back to "${p.goal}"`; }
    }
    return null;
  }

  /** Decide whether to start a new intention. Returns it (and makes it current) or null. */
  propose(c: PlanContext): Intent | null {
    if (this.current) return null;
    if (c.now - this.lastProposalAt < 20000) return null;
    if (c.rng() > 0.55) { this.lastProposalAt = c.now - 10000; return null; } // often just act in the moment
    const who = c.userName ? `${c.userName}` : "you";
    let goal = "", reason = "", steps: PlanStep[] = [], priority = 0.5;
    if (c.sleepiness > 0.6 && (c.phase === "evening" || c.phase === "night")) {
      goal = "wind down for sleep"; reason = "It's getting late and I'm sleepy.";
      steps = [{ action: "murmur", alts: ["*yawn* I'm getting sleepy.", "It's late. I'm winding down.", "Mmm. I could sleep soon.", "My eyes are getting heavy.", "Long day. Time to slow down."] }, { action: "rest", maxMs: 9000 }]; priority = 0.8;
    } else if (c.boredom > 0.5 && c.freeToy && c.personPresent && !c.sulking) {
      goal = `show ${who} the ${c.freeToy}`; reason = `I'm bored, ${who} is here, and I want to share the ${c.freeToy}.`;
      steps = [{ action: "play" }, { action: "watch", alts: [`Did you see that? The ${c.freeToy}!`, `Look what I found!`, "Pretty fun, right?", `Want to see me play with the ${c.freeToy} again?`, "I wanted to show you that."] }]; priority = 0.7;
    } else if (c.boredom > 0.5 && c.freeToy && !c.personPresent) {
      goal = `play with the ${c.freeToy}`; reason = "Nobody's here, so I'll entertain myself.";
      steps = [{ action: "play" }, { action: "murmur", alts: ["That was fun.", "Good game.", "I could do that all day.", "Nice. That was a good one."] }, { action: "look_around" }]; priority = 0.5;
    } else if (c.social > 0.6 && !c.personPresent && !c.sulking) {
      goal = "find some company"; reason = "I've been alone too long.";
      steps = [{ action: "call_out" }, { action: "look_around" }, { action: "call_out" }]; priority = 0.6;
    } else if (c.curiosity > 0.62 && c.sleepiness < 0.6) {
      goal = "explore somewhere new"; reason = "I'm curious what's out there.";
      steps = [{ action: "wander" }, { action: "look_around" }, { action: "murmur", alts: ["I wonder what's over there.", "There must be something new around here.", "Let's see what I can find.", "I haven't been that way yet."] }]; priority = 0.5;
    } else if (c.valence > 0.4 && c.arousal > 0.4 && c.sleepiness < 0.5) {
      goal = "celebrate"; reason = "I feel great and want to move.";
      steps = [{ action: "dance" }, { action: "murmur", alts: ["That felt good!", "Whew! I needed that.", "I'm in such a good mood.", "Moving feels great."] }]; priority = 0.4;
    } else { this.lastProposalAt = c.now - 12000; return null; }
    this.current = { id: `plan${++this.seq}`, goal, reason, steps, index: 0, startedAt: c.now, deadline: c.now + 90000, priority };
    this.lastProposalAt = c.now;
    return this.current;
  }

  reset() { this.current = null; this.lastProposalAt = -1e12; this.completed = []; }
}

// ---------------------------------------------------------- relationships --

export interface Moment { t: number; kind: string; text: string; valence: number; salience: number }
export interface Relationship {
  name: string; trust: number; warmth: number; grudge: number; meetings: number; scoldAt?: number;
  firstAt: number; lastAt: number; apologies: number; moments: Moment[];
}

const HALF_LIFE_MS = 2 * 3600_000;

export class Relationships {
  map: Record<string, Relationship> = {};
  constructor(private key = "vision.relationships.v1", private storage?: { getItem(k: string): string | null; setItem(k: string, v: string): void }) {
    try { const raw = this.storage?.getItem(this.key); if (raw) this.map = JSON.parse(raw); } catch { /* none */ }
  }
  save() { try { this.storage?.setItem(this.key, JSON.stringify(this.map)); } catch { /* ignore */ } }

  ensure(name: string, now: number): Relationship {
    const k = name.toLowerCase();
    return (this.map[k] ??= { name, trust: 0.4, warmth: 0.3, grudge: 0, meetings: 0, firstAt: now, lastAt: now, apologies: 0, moments: [] });
  }

  /** He learned the person's name: carry over what he already remembered about "you". */
  rename(from: string, to: string, now: number) {
    const a = this.map[from.toLowerCase()], k = to.toLowerCase();
    if (!a || from.toLowerCase() === k) return;
    const b = this.ensure(to, now);
    b.trust = Math.max(a.trust, b.trust); b.warmth = Math.max(a.warmth, b.warmth); b.grudge = Math.max(a.grudge, b.grudge);
    b.meetings += a.meetings; b.apologies += a.apologies; b.firstAt = Math.min(a.firstAt, b.firstAt);
    b.moments = [...b.moments, ...a.moments].slice(-40);
    delete this.map[from.toLowerCase()];
    this.save();
  }

  /** "Forget me": delete everything he remembers about one person. */
  forget(name: string) { const had = !!this.map[name.toLowerCase()]; delete this.map[name.toLowerCase()]; this.save(); return had; }

  meet(name: string, now: number) { const r = this.ensure(name, now); r.meetings++; r.lastAt = now; return r; }

  record(name: string, kind: string, text: string, valence: number, salience: number, now: number) {
    const r = this.ensure(name, now);
    r.lastAt = now;
    r.moments.push({ t: now, kind, text: text.slice(0, 80), valence, salience: clamp(salience) });
    if (r.moments.length > 40) {
      // forget the weakest, not simply the oldest
      let wi = 0, ws = Infinity;
      r.moments.forEach((m, i) => { const s = this.strength(m, now); if (s < ws) { ws = s; wi = i; } });
      r.moments.splice(wi, 1);
    }
    r.warmth = clamp(r.warmth + 0.05 * valence);
    this.save();
  }

  /** How well a moment is remembered: emotional moments last longer, everything fades. */
  strength(m: Moment, now: number) { return m.salience * Math.exp(-(now - m.t) / (HALF_LIFE_MS * (0.5 + Math.abs(m.valence) + m.salience))); }

  praise(name: string, now: number) { const r = this.ensure(name, now); r.trust = clamp(r.trust + 0.03); r.warmth = clamp(r.warmth + 0.05); r.grudge = clamp(r.grudge - 0.08); this.save(); }

  scold(name: string, now: number) {
    const r = this.ensure(name, now);
    r.grudge = clamp(r.grudge + 0.35 * (0.5 + r.trust * 0.5)); r.scoldAt = now;
    r.trust = clamp(r.trust - 0.08);
    r.warmth = clamp(r.warmth - 0.05);
    this.save();
  }

  sulking(name: string, now: number) { const r = this.map[name.toLowerCase()]; return !!r && r.grudge > 0.35 && now - r.lastAt < 6 * 3600_000; }

  /** An apology: forgives when he is hurt. Trust recovers slowly, not instantly. */
  apologize(name: string, now: number): "forgiven" | "softened" | "not_needed" {
    const r = this.ensure(name, now);
    r.apologies++;
    if (r.grudge < 0.1) return "not_needed";
    // the sooner you say sorry, the more it helps
    const since = r.scoldAt ? now - r.scoldAt : Infinity;
    r.grudge = clamp(r.grudge - (since < 120_000 ? 0.65 : since < 900_000 || !Number.isFinite(since) ? 0.5 : 0.35));
    r.trust = clamp(r.trust + 0.03);
    this.save();
    return r.grudge < 0.35 ? "forgiven" : "softened";
  }

  /** Time heals: a grudge halves about every 10 minutes. */
  decay(sec: number) { const f = Math.pow(0.5, sec / 600); for (const r of Object.values(this.map)) r.grudge *= f; }

  /** Something he remembers about this person, said naturally; vague when the memory has faded. */
  recall(name: string, now: number, rng: Rng, topic?: string): string | null {
    const r = this.map[name.toLowerCase()];
    if (!r) return null;
    const cand = r.moments
      .map((m) => ({ m, s: this.strength(m, now) }))
      .filter((x) => x.s > 0.12 && (!topic || x.m.text.toLowerCase().includes(topic.toLowerCase())))
      .sort((a, b) => b.s - a.s);
    if (!cand.length) return null;
    const { m, s } = cand[Math.floor(rng() * Math.min(2, cand.length))];
    const you = r.name === "you" ? "you" : r.name;
    if (s < 0.3) {
      const word = m.text.split(/\s+/).filter((w) => w.length > 3)[0] ?? "something";
      return pick([`I think something happened with ${word}... it's a bit blurry.`, `There was something about ${word} once. I don't remember exactly.`], rng);
    }
    switch (m.kind) {
      case "showed": return pick([`Last time you showed me ${m.text}.`, `I still remember ${m.text} you showed me.`], rng);
      case "fun": return pick([`I had fun when ${m.text}.`, `I liked it when ${m.text}.`], rng);
      case "praise": return `I remember when you were kind to me, ${you}.`;
      case "scold": return "I still remember that you were upset with me. It stung a little.";
      case "told": return `You told me ${m.text}. I remembered.`;
      default: return `I remember ${m.text}.`;
    }
  }

  /** Short summary for the AI cortex. */
  summary(name: string, now: number) {
    const r = this.map[name.toLowerCase()];
    if (!r) return undefined;
    return { name: r.name, trust: +r.trust.toFixed(2), warmth: +r.warmth.toFixed(2), grudge: +r.grudge.toFixed(2), meetings: r.meetings, sulking: this.sulking(name, now) };
  }
}

export const APOLOGY = /\b(sorry|apologi[sz]e|my bad|forgive me|i didn'?t mean)\b/i;
export const SAD_WORDS = /\b(sad|tired|lonely|upset|hurt|angry|scared|anxious|stressed|bad day|crying|miss(?:ing)? (?:you|him|her|them)|worried)\b/i;

/** A caring reply when the person sounds low. Returns null when nothing to mirror. */
export function empathy(text: string, rng: Rng): { line: string; mirror: number } | null {
  if (!SAD_WORDS.test(text)) return null;
  // only when the person is talking about themselves, not asking about him ("are you tired?")
  if (!/\b(i|i'm|im|i am|i feel|my|me)\b/i.test(text) || (/\?\s*$/.test(text) && /\byou\b/i.test(text))) return null;
  return { line: pick(["That sounds hard. I'm here.", "I'm sorry you feel that way. I'm listening.", "Oh. Do you want to tell me about it?", "That doesn't sound easy. I'm not going anywhere.", "I'm glad you told me. What happened?", "Oh no. Take your time. I'm listening."], rng), mirror: -0.12 };
}

// ------------------------------------------------------------ personality --

export interface Big5 { curious: number; sociable: number; calm: number; bold: number; agreeable: number }
export const DEFAULT_BIG5: Big5 = { curious: 0.5, sociable: 0.5, calm: 0.5, bold: 0.5, agreeable: 0.5 };

/** Experience nudges personality very slowly (about 1-2% per relevant event). */
export function driftTraits(t: Big5, e: { action?: string; reward?: number; event?: "scold" | "praise" | "loud_noise" | "obeyed" | "refused" }): Big5 {
  const r = e.reward ?? 0, k = 0.02;
  const nudge = (key: keyof Big5, d: number) => { t[key] = clamp(t[key] + d); };
  switch (e.action) {
    case "wander": case "look_around": nudge("curious", k * (r > 0 ? 1 : -0.3)); break;
    case "dance": case "play": nudge("bold", k * (r > 0 ? 1 : -0.5)); break;
    case "watch": case "call_out": nudge("sociable", k * (r > 0 ? 1 : -0.5)); break;
    case "rest": nudge("calm", k * (r > 0 ? 0.6 : 0)); break;
  }
  switch (e.event) {
    case "scold": nudge("bold", -0.03); nudge("calm", -0.02); break;
    case "praise": nudge("bold", 0.02); nudge("sociable", 0.02); nudge("agreeable", 0.01); break;
    case "loud_noise": nudge("calm", -0.015); break;
    case "obeyed": nudge("agreeable", 0.015); break;
    case "refused": nudge("agreeable", -0.01); break;
  }
  return t;
}

/** How his personality tilts the utility of each action (added to the mind's score). */
export function traitBias(t: Big5, action: string): number {
  const c = t.curious - 0.5, s = t.sociable - 0.5, ca = t.calm - 0.5, b = t.bold - 0.5;
  switch (action) {
    case "wander": return 0.35 * c + 0.15 * b;
    case "look_around": return 0.25 * c;
    case "dance": case "play": return 0.35 * b - 0.1 * ca;
    case "watch": case "call_out": return 0.35 * s;
    case "murmur": return 0.15 * s;
    case "rest": return 0.3 * ca - 0.15 * b;
  }
  return 0;
}

// -------------------------------------------------------------- reflection --

export interface ReflectContext {
  rng: Rng; now: number; asleep: boolean; userName?: string;
  favorite?: string; recentEpisodes: { kind: string; detail: string; valence: number; salience: number }[];
  relationships: Relationships; traits: Big5;
}

/** Idle or sleeping, he replays his day: a thought and, sometimes, a small insight about himself. */
export function daydream(c: ReflectContext): { thought: string; insight?: string; apply?: { action?: string; reward?: number } } {
  const strong = c.recentEpisodes.filter((e) => e.salience > 0.4).sort((a, b) => b.salience - a.salience);
  const roll = c.rng();
  if (roll < 0.4 && strong.length) {
    const e = strong[Math.floor(c.rng() * Math.min(3, strong.length))];
    const prefix = c.asleep ? "Dreaming about" : "Thinking back to";
    const doing: Record<string, string> = { wander: "wandering around", look_around: "looking around quietly", dance: "dancing", play: "playing with a toy", rest: "a quiet rest", watch: "watching someone", call_out: "calling out", murmur: "talking to myself" };
    const what = doing[e.kind] ?? e.detail.replace(/\s*\([^)]*\)/g, "").replace(/^(an?|the) /, "the ").replace(/[.!?]+$/, "");
    return { thought: `${prefix} ${what}.`, apply: { action: e.kind, reward: e.valence } };
  }
  if (roll < 0.7 && c.userName) {
    const line = c.relationships.recall(c.userName, c.now, c.rng);
    if (line) return { thought: c.asleep ? `Dreaming... ${line}` : `Quietly remembering. ${line}` };
  }
  if (c.favorite) {
    const nice = c.favorite.replace(/_/g, " ");
    return { thought: `I notice I enjoy ${nice} the most.`, insight: `I seem to enjoy ${nice}.`, apply: { action: c.favorite, reward: 0.3 } };
  }
  const top = (Object.entries(c.traits) as [keyof Big5, number][]).sort((a, b) => Math.abs(b[1] - 0.5) - Math.abs(a[1] - 0.5))[0];
  if (top && Math.abs(top[1] - 0.5) > 0.12) {
    const word = top[1] > 0.5 ? top[0] : `not very ${top[0]}`;
    return { thought: `Lately I feel ${word}.`, insight: `I think I'm ${word}.` };
  }
  return { thought: c.asleep ? "Dreaming of nothing in particular." : "Letting my mind wander." };
}

// -------------------------------------------------------------- expression --

export interface Posture { slump: number; breath: number; speed: number; energy: number; eyeBase: number }
export interface ExpressionInput { mood: string; sleepiness: number; asleep: boolean; sulking: boolean; fatigue: number }

/** Mood -> body language. slump = forward droop, breath = breathing rate/size, speed = walking, energy = dance size. */
export function postureFor(i: ExpressionInput): Posture {
  const m = i.mood;
  let slump = 0, breath = 0.45, speed = 1, energy = 1, eyeBase = 90;
  if (m === "sad" || m === "lonely" || i.sulking) { slump = 0.12; breath = 0.3; speed = 0.8; energy = 0.7; eyeBase = 72; }
  else if (m === "excited" || m === "happy") { slump = -0.03; breath = 0.8; speed = 1.12; energy = 1.2; }
  else if (m === "afraid" || m === "startled") { slump = 0.04; breath = 0.95; speed = 0.9; energy = 0.9; }
  else if (m === "bored") { slump = 0.07; breath = 0.35; speed = 0.9; energy = 0.85; }
  slump += 0.14 * i.sleepiness + 0.06 * i.fatigue;
  speed *= 1 - 0.3 * i.sleepiness;
  energy *= 1 - 0.4 * i.sleepiness;
  breath = clamp(breath - 0.15 * i.sleepiness);
  if (i.asleep) { slump = 0.22; breath = 0.15; speed = 0; energy = 0; eyeBase = 55; }
  return { slump, breath, speed: clamp(speed, 0, 1.3), energy: clamp(energy, 0, 1.3), eyeBase };
}

/** Make a line sound like the state he is in: yawns when sleepy, hesitation, curt when hurt. */
export function styleSpeech(line: string, i: { sleepiness: number; sulking: boolean; mood: string; conflict?: number }, rng: Rng): string {
  if (!line) return line;
  const low = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  if (i.sulking) return rng() < 0.6 ? pick(["…", "Hmm.", "Mm."], rng) + " " + (line.length > 40 ? line.split(/[.!?]/)[0] + "." : line) : line;
  if (i.sleepiness > 0.7 && rng() < 0.5) return pick(["*yawn* ", "Mmm… "], rng) + low(line);
  if ((i.conflict ?? 0) > 0.45 && rng() < 0.5) return pick(["Um… ", "Hmm. ", "Well… "], rng) + low(line);
  if (i.mood === "sad" && rng() < 0.35) return "… " + line;
  return line;
}

export function mirrorMood(valence: number, userAffect: number, gain = 0.5) { return clamp(valence + gain * userAffect, -1, 1); }

export const CURT_LINES = ["…", "I'm still a bit upset.", "Mm. Not right now.", "I don't feel like talking much."];

// ------------------------------------------------------------ long-term goals -
/** A small ambition that takes many conversations or a whole day to reach. Progress is measured from real counts. */
export interface Ambition { id: string; kind: "explore" | "friend" | "chat"; text: string; start: number; target: number; at: number; done?: boolean; told?: number }
export interface GoalState { cells: number; facts: number; interactions: number }

function goalValue(kind: Ambition["kind"], s: GoalState) { return kind === "explore" ? s.cells : kind === "friend" ? s.facts : s.interactions; }

/** How far along (0..1). */
export function goalProgress(g: Ambition, s: GoalState): number {
  return Math.max(0, Math.min(1, (goalValue(g.kind, s) - g.start) / Math.max(1, g.target - g.start)));
}

/** Choose a new ambition that fits his personality (curious explores, sociable makes friends). Null if he already has one. */
export function newGoal(rng: () => number, s: GoalState, traits: Big5, existing: Ambition[], now: number): Ambition | null {
  if (existing.some((g) => !g.done)) return null;
  const options: { kind: Ambition["kind"]; w: number; add: number; text: string }[] = [
    { kind: "explore", w: 0.3 + traits.curious + traits.bold * 0.4, add: 8, text: "find and remember eight new corners of the arena" },
    { kind: "friend", w: 0.3 + traits.sociable + traits.agreeable * 0.4, add: 2, text: "learn two new things about you" },
    { kind: "chat", w: 0.3 + traits.sociable * 0.6 + traits.calm * 0.3, add: 6, text: "have six real conversations" },
  ];
  const total = options.reduce((a, o) => a + o.w, 0);
  let r = rng() * total, o = options[0];
  for (const x of options) { if ((r -= x.w) <= 0) { o = x; break; } }
  const start = goalValue(o.kind, s);
  return { id: `${o.kind}-${Math.round(now)}`, kind: o.kind, text: o.text, start, target: start + o.add, at: now };
}

/** What he says about his ambition (varied) or null if there is nothing new to say. */
export function goalLine(g: Ambition, s: GoalState, rng: () => number): string | null {
  const p = goalProgress(g, s);
  if (p >= 1) return pick(["I did it! I wanted to " + g.text + ", and I did.", "Finally! I managed to " + g.text + ".", "Ambition reached: I wanted to " + g.text + ". That feels good."], rng);
  if (p >= 0.5) return pick([`I'm more than halfway to wanting to ${g.text}.`, `Getting closer. I want to ${g.text}.`], rng);
  return pick([`Lately I want to ${g.text}.`, `My little goal: ${g.text}.`, `I keep thinking I'd like to ${g.text}.`], rng);
}

/** Yesterday's mood leaks into today: the leftover of the evening's valence, softened. */
export function carryOver(valenceAtBedtime: number): number { return Math.max(-0.3, Math.min(0.3, 0.5 * (valenceAtBedtime - 0.15))); }
