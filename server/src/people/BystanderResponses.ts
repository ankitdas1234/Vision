import { openRouterClient } from "../ai/OpenRouterClient";
import { aiConfig } from "../config/ai";
import { logger } from "../logging/Logger";

/**
 * BYSTANDER REPLY INTERPRETATION
 * ------------------------------
 * Closes a previously-documented gap: Vision used to ask bystanders
 * "have you seen so-and-so?" during a person search and never listened
 * for an answer.
 *
 * Two tiers, same pattern as perception/aiVisionDetector.ts and
 * EmbeddingPersonRecognizer elsewhere in this codebase — a real AI model
 * upgrades quality when configured, a deterministic heuristic always
 * works as the floor:
 *
 *   - No OPENROUTER_API_KEY: `interpretBystanderReplyKeywords` — simple
 *     yes/no keyword matching plus a small fixed list of common room
 *     names. Not real NLU, and open-ended location extraction isn't
 *     possible without one.
 *   - OPENROUTER_API_KEY configured: `interpretBystanderReply` asks the
 *     model to classify the reply and extract ANY location mentioned
 *     (not limited to the fixed list) as structured JSON. Falls back to
 *     the keyword heuristic if the model call fails or returns something
 *     unparseable — this must never throw into the conversation flow.
 *
 * Either way: a location hint gets logged onto the search task for a
 * human to read later (routes/conversation.routes.ts), not acted on by
 * changing the patrol — there's no room-level navigation anywhere in this
 * codebase (see docs/people.md "Known limitations"), so pretending a hint
 * changes where the robot walks would be dishonest regardless of how the
 * hint was extracted.
 */

export type BystanderReplyType = "SAW_THEM" | "HAVE_NOT_SEEN" | "LOCATION_HINT" | "UNCLEAR";

export interface BystanderInterpretation {
  type: BystanderReplyType;
  locationHint?: string;
  /** What Vision says back — always something, so the interaction never
   * feels like it was ignored even when the transcript was unclear. */
  reply: string;
}

/** Not exhaustive — a small, honest set of common room names rather than
 * an attempt at open-ended location extraction. Used by the keyword
 * fallback only; the AI-backed path extracts any location mentioned. */
const KNOWN_LOCATIONS = [
  "kitchen", "living room", "bedroom", "bathroom", "garage", "hallway",
  "office", "backyard", "front door", "upstairs", "downstairs", "basement",
  "dining room", "yard",
];

const NEGATIVE_PATTERNS = [/\bno\b/i, /\bhaven'?t\b/i, /\bnot seen\b/i, /\bdon'?t know\b/i, /\bno idea\b/i, /\bnope\b/i];
const POSITIVE_PATTERNS = [/\byes\b/i, /\byeah\b/i, /\byep\b/i, /\bsaw (him|her|them)\b/i, /\bthere\b/i];

export function interpretBystanderReplyKeywords(transcript: string): BystanderInterpretation {
  const text = transcript.toLowerCase();

  const locationHint = KNOWN_LOCATIONS.find((location) => text.includes(location));
  if (locationHint) {
    return { type: "LOCATION_HINT", locationHint, reply: `Thanks — I'll keep that in mind.` };
  }
  if (NEGATIVE_PATTERNS.some((pattern) => pattern.test(text))) {
    return { type: "HAVE_NOT_SEEN", reply: "Okay, thanks anyway — I'll keep looking." };
  }
  if (POSITIVE_PATTERNS.some((pattern) => pattern.test(text))) {
    return { type: "SAW_THEM", reply: "Great, thank you!" };
  }
  return { type: "UNCLEAR", reply: "Okay, thanks." };
}

const AI_PROMPT = `You are interpreting one bystander's reply to a home robot that just asked "have you seen {name}?" while searching for that person.
Classify the reply and respond with STRICT JSON only, no prose, no markdown fences:
{"type": "SAW_THEM" | "HAVE_NOT_SEEN" | "LOCATION_HINT" | "UNCLEAR", "locationHint": string or null, "reply": string}
- "type": SAW_THEM if they say they saw the person with no location; HAVE_NOT_SEEN if they haven't; LOCATION_HINT if they mention or imply a place (fill "locationHint" with that place in a few words); UNCLEAR if the reply doesn't answer the question at all.
- "reply": a short, natural one-sentence acknowledgement Vision should say back (e.g. "Thanks, I'll check there." or "Okay, thanks anyway.").
Reply to interpret: `;

function safeParseInterpretation(raw: string): BystanderInterpretation | null {
  try {
    const cleaned = raw.trim().replace(/^```json\s*|^```\s*|```$/g, "");
    const parsed = JSON.parse(cleaned) as Partial<BystanderInterpretation>;
    if (!parsed.type || !parsed.reply) return null;
    if (!["SAW_THEM", "HAVE_NOT_SEEN", "LOCATION_HINT", "UNCLEAR"].includes(parsed.type)) return null;
    return {
      type: parsed.type,
      reply: parsed.reply,
      ...(parsed.locationHint ? { locationHint: parsed.locationHint } : {}),
    };
  } catch {
    return null;
  }
}

/** Main entry point — AI-backed when configured, deterministic keyword
 * fallback otherwise or on any failure. Never throws. */
export async function interpretBystanderReply(transcript: string, targetName: string): Promise<BystanderInterpretation> {
  if (!aiConfig.enabled) {
    return interpretBystanderReplyKeywords(transcript);
  }

  try {
    const response = await openRouterClient.complete({
      prompt: AI_PROMPT.replace("{name}", targetName) + transcript,
      purpose: "bystander_reply_interpretation",
    });
    const parsed = response.text ? safeParseInterpretation(response.text) : null;
    if (parsed) return parsed;
    logger.debug("AI bystander interpretation unparseable, falling back to keywords", { text: response.text });
  } catch (err) {
    logger.debug("AI bystander interpretation failed, falling back to keywords (non-fatal)", { error: (err as Error).message });
  }

  return interpretBystanderReplyKeywords(transcript);
}
