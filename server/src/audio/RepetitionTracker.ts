/**
 * "WHY DO YOU KEEP ASKING ME THE SAME THING?"
 * ------------------------------------------
 * Vision answers the same question patiently a few times — people forget,
 * mishear, or want to check. Past that it stops pretending it hasn't
 * noticed, and says so, getting shorter and blunter each time.
 *
 * WHAT COUNTS AS "THE SAME QUESTION": not string equality — nobody repeats
 * themselves word-for-word. Transcripts are normalized (punctuation and
 * conversational filler stripped) and compared by token overlap, so
 * "what's your name?", "hey Vision, what is your name" and "so what's
 * your name again" all land on the same question. This is a deliberately
 * cheap deterministic check, not semantic similarity — "what's the time"
 * and "what's the date" are correctly NOT the same, but paraphrases with
 * no shared words ("who are you" vs "what should I call you") will be
 * missed. That failure direction is the safe one: missing a repeat just
 * means Vision answers politely again.
 *
 * WHAT THIS DELIBERATELY DOESN'T COVER: commands. Repeating "stop" or
 * "turn left" five times is a person with a legitimate reason (it didn't
 * work the first time), not someone being annoying. The caller — see
 * routes/conversation.routes.ts — only runs conversational intents
 * through here.
 */

/** Repeats are only counted inside a rolling window. Asking the same
 * thing again tomorrow is a fresh question, not a continuation. */
export const REPETITION_WINDOW_MS = 10 * 60 * 1000;

/** How many times the same question can be asked before Vision reacts to
 * the repetition. Four total asks: the original plus three repeats — all
 * answered normally — and the fifth is where it pushes back. */
export const FREE_REPEATS = 4;

/** Token-overlap (Jaccard) score above which two utterances are treated as
 * the same question. Tuned high enough that a changed keyword ("time" vs
 * "date") separates them, low enough that filler and politeness don't. */
export const SIMILARITY_THRESHOLD = 0.6;

/** Cap per speaker so a long session can't grow unbounded. */
const MAX_TRACKED_UTTERANCES = 20;

/** Words carrying no question-identity — stripped before comparison so
 * "hey Vision, could you just tell me again what the time is please"
 * reduces to the same tokens as "what time is it". */
const FILLER_WORDS = new Set([
  "vision", "hey", "hi", "hello", "please", "just", "so", "um", "uh", "er", "like",
  "again", "okay", "ok", "well", "now", "then", "can", "could", "would", "will",
  "you", "your", "tell", "me", "us", "the", "a", "an", "is", "are", "was", "do",
  "does", "did", "to", "for", "of", "and", "i", "my", "sorry", "actually", "really",
]);

export interface RepetitionResult {
  /** How many times this question has now been asked in the window,
   * including the one just recorded. 1 = first time. */
  repeatCount: number;
  isRepeat: boolean;
  /** True when repeatCount has passed FREE_REPEATS — the caller should
   * speak `reply` instead of answering the question again. */
  annoyed: boolean;
  /** 0 = not annoyed, 1 = pointed it out, 2 = sharper, 3 = refusing. */
  level: 0 | 1 | 2 | 3;
  reply: string | null;
}

interface TrackedUtterance {
  tokens: Set<string>;
  count: number;
  lastSeenAtMs: number;
}

const historyBySpeaker = new Map<string, TrackedUtterance[]>();

export function normalizeTranscript(transcript: string): string[] {
  return transcript
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0 && !FILLER_WORDS.has(word));
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

function annoyedReply(count: number): { level: 1 | 2 | 3; reply: string } {
  if (count >= FREE_REPEATS + 4) {
    return { level: 3, reply: "No. I'm not answering that again — you've asked me the same thing over and over." };
  }
  if (count >= FREE_REPEATS + 2) {
    return { level: 2, reply: `That's ${count} times now. I already answered you — stop asking me the same question.` };
  }
  return { level: 1, reply: "I've already answered that. Why do you keep asking me the same thing again and again?" };
}

/**
 * Records one thing a person said and reports whether it's a repeat worth
 * getting short about. Call once per conversational turn, per speaker.
 *
 * `speakerKey` should be a stable person id where one is known; callers
 * fall back to a per-robot speaker tag for unidentified voices, which is
 * good enough within a single conversation.
 */
export function recordUtterance(speakerKey: string, transcript: string, now = Date.now()): RepetitionResult {
  const tokens = new Set(normalizeTranscript(transcript));
  const none: RepetitionResult = { repeatCount: 0, isRepeat: false, annoyed: false, level: 0, reply: null };
  if (tokens.size === 0) return none; // nothing but filler — can't be "the same question"

  const history = (historyBySpeaker.get(speakerKey) ?? []).filter((u) => now - u.lastSeenAtMs <= REPETITION_WINDOW_MS);

  let match: TrackedUtterance | null = null;
  let bestScore = 0;
  for (const entry of history) {
    const score = similarity(tokens, entry.tokens);
    if (score >= SIMILARITY_THRESHOLD && score > bestScore) {
      match = entry;
      bestScore = score;
    }
  }

  if (match) {
    match.count += 1;
    match.lastSeenAtMs = now;
    // Keep the newest phrasing — how someone asks tends to drift as they
    // repeat themselves, and matching against the drifted version keeps
    // the chain intact instead of breaking it halfway.
    match.tokens = tokens;
  } else {
    history.push({ tokens, count: 1, lastSeenAtMs: now });
  }

  while (history.length > MAX_TRACKED_UTTERANCES) history.shift();
  historyBySpeaker.set(speakerKey, history);

  const repeatCount = match ? match.count : 1;
  if (repeatCount <= FREE_REPEATS) {
    return { repeatCount, isRepeat: repeatCount > 1, annoyed: false, level: 0, reply: null };
  }

  const { level, reply } = annoyedReply(repeatCount);
  return { repeatCount, isRepeat: true, annoyed: true, level, reply };
}

/** Test/reset hook. */
export function resetRepetition(speakerKey?: string) {
  if (speakerKey) historyBySpeaker.delete(speakerKey);
  else historyBySpeaker.clear();
}
