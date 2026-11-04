import { openRouterClient } from "../ai/OpenRouterClient";
import { aiConfig } from "../config/ai";
import { logger } from "../logging/Logger";

/**
 * MEMORY REVIEW REPLY INTERPRETATION
 * -----------------------------------
 * Same two-tier shape as people/BystanderResponses.ts:
 *
 *   - No OPENROUTER_API_KEY: `interpretMemoryReviewReplyKeywords` — a
 *     simple yes/no keyword check, plus a "no, but/actually ..." pattern
 *     for catching a spoken correction rather than a flat rejection.
 *     Not real NLU, so a correction phrased without one of those cue
 *     words won't be recognized as a correction — it'll just read as
 *     UNCLEAR and leave the fact untouched (asked again another day)
 *     rather than guessing wrong.
 *   - OPENROUTER_API_KEY configured: `interpretMemoryReviewReply` asks
 *     the model to classify the reply AND extract the corrected wording
 *     when there is one, as structured JSON. Falls back to the keyword
 *     heuristic if the call fails or returns something unparseable —
 *     this must never throw into the conversation flow.
 *
 * Either way, this only ever reads a reply — persisting the decision
 * (VERIFIED/REJECTED/corrected content) happens in
 * routes/conversation.routes.ts via memory.repository.ts, not here.
 */

export type MemoryReviewReplyType = "CONFIRM" | "REJECT" | "CORRECTION" | "UNCLEAR";

export interface MemoryReviewInterpretation {
  type: MemoryReviewReplyType;
  /** Only set for CORRECTION — the new wording to save in place of the
   * old content. */
  correctedContent?: string;
  /** What Vision says back — always something, so confirming/correcting
   * a fact never feels like it vanished into silence. */
  reply: string;
}

const NEGATIVE_PATTERNS = [/^no\b/i, /^nope\b/i, /^nah\b/i, /^not quite\b/i, /^not really\b/i, /^not exactly\b/i, /^that'?s not right\b/i, /^that'?s wrong\b/i, /^incorrect\b/i];
const POSITIVE_PATTERNS = [/^yes\b/i, /^yeah\b/i, /^yep\b/i, /^correct\b/i, /^that'?s right\b/i, /^right\b/i, /^exactly\b/i];
// "no, actually he likes it loud" / "not really, he prefers rock" / "no,
// it's more that ..." — strips the leading negative + connector so
// what's left is just the corrected fact. Must cover the same lead-ins
// as NEGATIVE_PATTERNS above, or a correction after one of the newer
// ones (e.g. "not really") would fail to strip and get misread as a
// flat rejection instead of a correction.
const CORRECTION_PREFIX = /^(?:no|nope|nah|not quite|not really|not exactly|that'?s not right|that'?s wrong|incorrect)\b[\s,]*(?:actually|it'?s more (?:that|like)|i meant|i think)?[\s,]*/i;

export function interpretMemoryReviewReplyKeywords(transcript: string): MemoryReviewInterpretation {
  const text = transcript.trim();

  const isNegative = NEGATIVE_PATTERNS.some((p) => p.test(text));
  if (isNegative) {
    const remainder = text.replace(CORRECTION_PREFIX, "").trim();
    // A negative with something substantial left over is a correction
    // ("no, actually he likes it loud"); a bare "no"/"nope" with nothing
    // left is a flat rejection.
    if (remainder.length > 2 && remainder.toLowerCase() !== text.toLowerCase()) {
      return { type: "CORRECTION", correctedContent: capitalize(remainder), reply: "Got it, I'll remember it that way instead." };
    }
    return { type: "REJECT", reply: "Okay, I'll forget that then." };
  }

  if (POSITIVE_PATTERNS.some((p) => p.test(text))) {
    return { type: "CONFIRM", reply: "Great, thanks for confirming!" };
  }

  return { type: "UNCLEAR", reply: "No worries, I'll leave it as it is for now." };
}

function capitalize(text: string): string {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}

const AI_PROMPT = `You are interpreting one admin's spoken reply to a home robot that just asked whether a fact it learned is correct, e.g. "I picked up that Ram prefers quiet music. Did I get that right?"
Classify the reply and respond with STRICT JSON only, no prose, no markdown fences:
{"type": "CONFIRM" | "REJECT" | "CORRECTION" | "UNCLEAR", "correctedContent": string or null, "reply": string}
- "type": CONFIRM if they say it's right; REJECT if they say it's wrong with no replacement given; CORRECTION if they say it's wrong AND give the corrected version (fill "correctedContent" with just the corrected fact, phrased naturally, not a repeat of the whole reply); UNCLEAR if the reply doesn't actually answer the question.
- "reply": a short, natural one-sentence acknowledgement Vision should say back.
Reply to interpret: `;

function safeParseInterpretation(raw: string): MemoryReviewInterpretation | null {
  try {
    const cleaned = raw.trim().replace(/^```json\s*|^```\s*|```$/g, "");
    const parsed = JSON.parse(cleaned) as Partial<MemoryReviewInterpretation>;
    if (!parsed.type || !parsed.reply) return null;
    if (!["CONFIRM", "REJECT", "CORRECTION", "UNCLEAR"].includes(parsed.type)) return null;
    if (parsed.type === "CORRECTION" && !parsed.correctedContent) return null;
    return {
      type: parsed.type,
      reply: parsed.reply,
      ...(parsed.correctedContent ? { correctedContent: parsed.correctedContent } : {}),
    };
  } catch {
    return null;
  }
}

/** Main entry point — AI-backed when configured, deterministic keyword
 * fallback otherwise or on any failure. Never throws. */
export async function interpretMemoryReviewReply(transcript: string): Promise<MemoryReviewInterpretation> {
  if (!aiConfig.enabled) {
    return interpretMemoryReviewReplyKeywords(transcript);
  }

  try {
    const response = await openRouterClient.complete({ prompt: AI_PROMPT + transcript, purpose: "memory_review_reply_interpretation" });
    const parsed = response.text ? safeParseInterpretation(response.text) : null;
    if (parsed) return parsed;
    logger.debug("AI memory-review interpretation unparseable, falling back to keywords", { text: response.text });
  } catch (err) {
    logger.debug("AI memory-review interpretation failed, falling back to keywords (non-fatal)", { error: (err as Error).message });
  }

  return interpretMemoryReviewReplyKeywords(transcript);
}
