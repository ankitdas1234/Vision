import { openRouterClient } from "../ai/OpenRouterClient";
import { logger } from "../logging/Logger";

/**
 * SONG QUESTION PROPOSER
 * -----------------------
 * While Vision searches for a requested song (music/PlaySongService.ts),
 * it makes small talk about the person's own taste — "why do you love
 * this song?", "who's your favorite artist?" — the same constrained-
 * generation pattern as decisions/GoalProposer.ts: a real model call,
 * but scoped tightly enough that it can't go somewhere it shouldn't.
 *
 * HARD RULE, enforced both in the prompt and by validating the output:
 * questions are about the PERSON's feelings/preferences/history with
 * music, never about the song's actual content. Vision never asks the
 * model to discuss, describe, quote, or paraphrase lyrics — that would
 * risk reproducing copyrighted text, which this project treats as a
 * hard boundary the same way it treats not extracting audio from
 * YouTube. A response that mentions "lyrics" or contains a suspiciously
 * long quoted passage is rejected and replaced with a safe fallback
 * question instead of being spoken.
 */

const MAX_QUESTION_LENGTH = 200;
const FORBIDDEN_TERMS = ["lyric", "verse", "chorus line", "the words go", "sings \""];

/** Curated fallback bank — used when AI isn't configured, a response
 * fails validation, or the call fails outright. Cycles by questionIndex
 * so a multi-question conversation doesn't repeat itself. */
const FALLBACK_QUESTIONS = [
  "While I look for that — what made you think of this song right now?",
  "Who's your favorite artist these days?",
  "How did you first discover their music?",
  "What's it about this song that you love most?",
  "Do you have a favorite memory tied to this song?",
];

export interface SongQuestionContext {
  requestedText: string;
  questionIndex: number;
}

export interface ProposedQuestion {
  question: string;
  fromModel: boolean;
}

function fallbackQuestion(questionIndex: number): ProposedQuestion {
  return { question: FALLBACK_QUESTIONS[questionIndex % FALLBACK_QUESTIONS.length], fromModel: false };
}

function isValid(question: string): boolean {
  if (!question || question.length === 0 || question.length > MAX_QUESTION_LENGTH) return false;
  const lower = question.toLowerCase();
  if (FORBIDDEN_TERMS.some((term) => lower.includes(term))) return false;
  // A long quoted span is a strong signal of an attempted lyric quote —
  // reject rather than try to guess whether it's actually lyrics.
  const longQuoteMatch = question.match(/"([^"]{40,})"/);
  if (longQuoteMatch) return false;
  return true;
}

function buildPrompt(ctx: SongQuestionContext): string {
  return [
    "You are a friendly home robot named Vision, making small talk with someone",
    `while you search for a song they asked to hear ("${ctx.requestedText}").`,
    "Ask ONE short, warm, genuine follow-up question about THEM — their own",
    "taste, memories, or feelings about music. Examples of the right kind of",
    "question: why they love a song, who their favorite artist is, how they",
    "discovered an artist, what a song reminds them of.",
    "",
    "You must NEVER ask about, describe, quote, or reference the song's actual",
    "lyrics, verses, or words — only ask about the person's own experience.",
    "",
    "Respond with ONLY the question itself, one sentence, no quotation marks,",
    "no preamble.",
  ].join("\n");
}

/** Proposes one genuine conversational question. Never throws — any
 * failure mode (AI not configured, bad response, network error) degrades
 * to the curated fallback bank rather than staying silent or risking an
 * unvalidated response reaching AUDIO_SPEAK. */
export async function proposeSongQuestion(ctx: SongQuestionContext): Promise<ProposedQuestion> {
  try {
    const response = await openRouterClient.complete({ prompt: buildPrompt(ctx), purpose: "song_question" });
    if (!response.text) return fallbackQuestion(ctx.questionIndex);

    const cleaned = response.text.trim().replace(/^["']|["']$/g, "");
    if (!isValid(cleaned)) {
      logger.debug("Song question failed validation, using fallback", { rawText: response.text.slice(0, 200) });
      return fallbackQuestion(ctx.questionIndex);
    }
    return { question: cleaned, fromModel: true };
  } catch (err) {
    logger.debug("Song question proposal failed (non-fatal), using fallback", { error: (err as Error).message });
    return fallbackQuestion(ctx.questionIndex);
  }
}
