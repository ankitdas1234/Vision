export interface Intent {
  type: "MOVEMENT_COMMAND" | "QUESTION" | "GREETING" | "SMALL_TALK" | "ADMIN_VETO" | "ADMIN_LIFT_RESTRICTION" | "EMERGENCY_STOP_REQUEST" | "PLAY_SONG" | "DANCE_PREFERENCE" | "NOT_ME" | "UNKNOWN";
  payload?: Record<string, unknown>;
}

/** Deliberately distinct from the plain "stop" in MOVEMENT_PHRASES (which
 * only issues WALK_STOP — always allowed, for anyone, exactly the
 * accessible-to-everyone behavior EMERGENCY_STOP itself now deliberately
 * gives up — see ADMIN_ONLY_COMMANDS in packages/commands.ts). Matched
 * BEFORE the movement-phrase loop below so "emergency stop" is never
 * absorbed by the plain "stop" substring match. The caller (see
 * routes/conversation.routes.ts) is the one that actually checks whether
 * the speaker is a confirmed admin — this only recognizes the phrase. */
const EMERGENCY_STOP_PHRASES = ["emergency stop", "vision emergency stop", "stop everything now", "shut down now"];

const MOVEMENT_PHRASES: Record<string, string> = {
  "move forward": "WALK_FORWARD", "walk forward": "WALK_FORWARD", "go forward": "WALK_FORWARD",
  "move backward": "WALK_BACKWARD", "walk backward": "WALK_BACKWARD", "go back": "WALK_BACKWARD",
  "turn left": "TURN_LEFT", "turn right": "TURN_RIGHT", "stop": "WALK_STOP",
};

/** Phrases an ADMIN uses to veto whatever Vision just did/was told to do.
 * Deliberately only checked against ADMIN-role speakers by the caller —
 * see ConversationArbiterService and audio.routes.ts — a visitor saying
 * "don't do that" has no special authority and is treated as SMALL_TALK. */
const ADMIN_VETO_PHRASES = [
  "don't do that", "do not do that", "don't do like that", "never do that again",
  "stop doing that", "you can't do that", "vision don't do that", "vision stop doing that",
];

const ADMIN_LIFT_PHRASES = ["you can do that now", "that's allowed again", "lift the restriction", "you may do that now"];

/** "Don't dance" / "you can dance now" — per-person, checked BEFORE
 * PLAY_SONG so a bare preference statement (not attached to a play
 * request) is recognized on its own. See music/PlaySongService.ts for
 * how the resulting preference actually gates dancing. */
const DANCE_OFF_PHRASES = ["don't dance", "do not dance", "stop dancing", "no dancing", "no need to dance"];
const DANCE_ON_PHRASES = ["you can dance now", "ok dance", "okay dance", "go ahead and dance", "you may dance now"];

/** "That's not me" — the person is telling Vision it misidentified them.
 * See people/PersonEncounterService.ts / routes/people.routes.ts's
 * DELETE /people/:id/faces for what happens with this. */
const NOT_ME_PHRASES = ["that's not me", "that is not me", "you have the wrong person", "i'm not who you think", "wrong person"];

/** Matches "play <song>" / "play some <song>" / "put on <song>" — the
 * captured group is passed through as the raw request text (whatever
 * they said after the trigger phrase), not parsed further here. See
 * music/PlaySongService.ts for what happens with it. */
const PLAY_SONG_PATTERN = /^(?:vision[,]?\s+)?(?:play|put on)\s+(.+)$/i;

/** Extremely small rule-based intent classifier — a real deployment routes uncertain cases to OpenRouter. */
export function understandIntent(transcript: string): Intent {
  const text = transcript.trim().toLowerCase();
  if (!text) return { type: "UNKNOWN" };

  if (EMERGENCY_STOP_PHRASES.some((p) => text.includes(p))) return { type: "EMERGENCY_STOP_REQUEST" };
  if (ADMIN_VETO_PHRASES.some((p) => text.includes(p))) return { type: "ADMIN_VETO", payload: { text } };
  if (ADMIN_LIFT_PHRASES.some((p) => text.includes(p))) return { type: "ADMIN_LIFT_RESTRICTION", payload: { text } };

  if (DANCE_OFF_PHRASES.some((p) => text.includes(p))) return { type: "DANCE_PREFERENCE", payload: { enabled: false } };
  if (DANCE_ON_PHRASES.some((p) => text.includes(p))) return { type: "DANCE_PREFERENCE", payload: { enabled: true } };
  if (NOT_ME_PHRASES.some((p) => text.includes(p))) return { type: "NOT_ME" };

  const playMatch = text.match(PLAY_SONG_PATTERN);
  if (playMatch) return { type: "PLAY_SONG", payload: { requestedText: playMatch[1].trim() } };

  for (const [phrase, command] of Object.entries(MOVEMENT_PHRASES)) {
    if (text.includes(phrase)) return { type: "MOVEMENT_COMMAND", payload: { command } };
  }
  if (text.includes("hello") || text.includes("hi vision")) return { type: "GREETING" };
  if (text.endsWith("?")) return { type: "QUESTION", payload: { question: text } };
  return { type: "SMALL_TALK", payload: { text } };
}
