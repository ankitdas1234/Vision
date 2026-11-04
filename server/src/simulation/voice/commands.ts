/**
 * Voice view: wake-word commands that never touch an AI, plus safe parsing of command tags the AI may embed.
 * Ported from the auto-simulation project. Everything that reaches the 3D rig passes a fixed safelist and
 * numeric clamps first. Simulation only: nothing here can reach the real robot.
 */

/** Commands the LLM may put in [[CMD:...]] tags. */
export const LLM_COMMAND_TYPES = [
  "EYE_CENTER", "EYE_SET", "EYE_LEFT", "EYE_RIGHT", "TURN_LEFT", "TURN_RIGHT",
  "WALK_FORWARD", "WALK_BACKWARD", "WALK_STOP", "DANCE", "EMERGENCY_STOP", "EMERGENCY_CLEAR", "AUDIO_SPEAK",
] as const;
/** Extra commands only the server's own fast path may emit (never the AI). */
export type CommandType = (typeof LLM_COMMAND_TYPES)[number] | "STOP_MUSIC";

export type Instruction =
  | { op: "EXEC"; command: CommandType; arg?: number | string }
  | { op: "SLEEP"; ms: number };

const isLlmCommand = (v: string): v is (typeof LLM_COMMAND_TYPES)[number] => (LLM_COMMAND_TYPES as readonly string[]).includes(v);

const ARG_BOUNDS: Partial<Record<CommandType, [number, number]>> = {
  EYE_SET: [0, 180], EYE_LEFT: [1, 90], EYE_RIGHT: [1, 90],
  TURN_LEFT: [150, 4000], TURN_RIGHT: [150, 4000],
  WALK_FORWARD: [200, 6000], WALK_BACKWARD: [200, 6000], DANCE: [400, 8000],
};
const MAX_INSTRUCTIONS_PER_TURN = 12;
const MAX_WAIT_MS = 5000;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function sanitizeArg(command: CommandType, raw: string | undefined): number | string | undefined {
  if (raw === undefined) return undefined;
  if (command === "AUDIO_SPEAK") return raw.replace(/^"|"$/g, "").trim().slice(0, 200) || undefined;
  const n = Number(raw);
  if (Number.isNaN(n)) return undefined;
  const b = ARG_BOUNDS[command];
  return b ? clamp(n, b[0], b[1]) : n;
}

/** Pulls [[CMD:NAME arg]] and [[WAIT:ms]] tags out of an AI reply. Anything not on the safelist is dropped silently. */
export function extractCommands(raw: string): { text: string; instructions: Instruction[] } {
  const instructions: Instruction[] = [];
  const text = raw
    .replace(/\[\[(CMD|WAIT):([^\]]*)\]\]/gi, (_m, kind: string, body: string) => {
      if (instructions.length >= MAX_INSTRUCTIONS_PER_TURN) return "";
      if (kind.toUpperCase() === "WAIT") {
        const ms = clamp(parseInt(body.trim(), 10) || 0, 0, MAX_WAIT_MS);
        if (ms > 0) instructions.push({ op: "SLEEP", ms });
        return "";
      }
      const parts = body.trim().split(/\s+/);
      const name = (parts.shift() || "").toUpperCase();
      if (!isLlmCommand(name)) return "";
      const arg = sanitizeArg(name, parts.length ? parts.join(" ") : undefined);
      instructions.push(arg === undefined ? { op: "EXEC", command: name } : { op: "EXEC", command: name, arg });
      return "";
    })
    .replace(/\[\[[^\]]*\]\]/g, "") // any other tag-looking text is never spoken
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, instructions };
}

interface DirectMatch { test: RegExp; reply: string; instructions: Instruction[] }
const exec = (command: CommandType, arg?: number | string): Instruction => (arg === undefined ? { op: "EXEC", command } : { op: "EXEC", command, arg });

const DIRECT_COMMANDS: DirectMatch[] = [
  { test: /^emergency stop$/, reply: "Emergency stop engaged.", instructions: [exec("EMERGENCY_STOP")] },
  { test: /^(clear|resume|release)( the)? (e-?stop|emergency)$/, reply: "Emergency stop cleared.", instructions: [exec("EMERGENCY_CLEAR")] },
  { test: /^dance( for me)?!?$/, reply: "Let's dance! Say Vision, stop when you want me to halt.", instructions: [exec("DANCE")] },
  { test: /^(stop music|stop the music|stop song|stop the song)$/, reply: "Stopping the music.", instructions: [exec("STOP_MUSIC"), exec("WALK_STOP")] },
  { test: /^(stop|stop dancing|stop moving|stop walking|halt|freeze|stand still)$/, reply: "Stopping.", instructions: [exec("STOP_MUSIC"), exec("WALK_STOP")] },
  { test: /^(walk|go|move)(\s+)?(forward|straight|ahead)$/, reply: "Walking forward. Say Vision, stop when you want me to halt.", instructions: [exec("WALK_FORWARD")] },
  { test: /^(walk|go|move)(\s+)?(backward|back|backwards)$/, reply: "Walking backward. Say Vision, stop when you want me to halt.", instructions: [exec("WALK_BACKWARD")] },
  { test: /^(turn|rotate|spin)?\s*left$/, reply: "Turning left.", instructions: [exec("TURN_LEFT", 600)] },
  { test: /^(turn|rotate|spin)?\s*right$/, reply: "Turning right.", instructions: [exec("TURN_RIGHT", 600)] },
  { test: /^look left$/, reply: "Looking left.", instructions: [exec("EYE_LEFT", 35)] },
  { test: /^look right$/, reply: "Looking right.", instructions: [exec("EYE_RIGHT", 35)] },
  { test: /^(look|center|face)( straight)?( ahead| forward| center)?$/, reply: "Centering.", instructions: [exec("EYE_CENTER")] },
  {
    test: /^(wave|say hi|say hello)$/, reply: "Hello there!",
    instructions: [exec("AUDIO_SPEAK", "Hello there!"), exec("TURN_LEFT", 300), { op: "SLEEP", ms: 300 }, exec("TURN_RIGHT", 300)],
  },
];

const WAKE_WORD = /^\s*vision[,!.]?\s+/i;

/** "Vision, dance" / "Vision, turn left" ... answered instantly, no AI call. Requires the wake word. */
export function matchDirectCommand(message: string): { reply: string; instructions: Instruction[] } | null {
  if (!WAKE_WORD.test(message)) return null;
  const rest = message.replace(WAKE_WORD, "").trim().toLowerCase().replace(/[.!?]+$/, "");
  for (const c of DIRECT_COMMANDS) if (c.test.test(rest)) return { reply: c.reply, instructions: c.instructions };
  return null;
}

/** "play <song>" / "play <song> and dance" (wake word optional). */
export function matchMusicRequest(message: string): { song: string; dance: boolean } | null {
  let text = message.trim().replace(WAKE_WORD, "").trim();
  let dance = false;
  const danceSuffix = /\s+(and|then|&)\s+dance(\s+for\s+me)?\s*[.!?]*$/i;
  if (danceSuffix.test(text)) { dance = true; text = text.replace(danceSuffix, "").trim(); }
  const dancePrefix = /^(play\s+and\s+dance(\s+to)?|dance\s+to)\s+/i;
  if (dancePrefix.test(text)) { dance = true; text = text.replace(dancePrefix, "").trim(); }
  const m = text.match(/^(?:play(?:\s+me)?(?:\s+the)?(?:\s+song)?)\s+(.+)$/i);
  if (m) {
    const song = m[1].trim().replace(/[.!?]+$/, "").replace(/\s+song$/i, "").trim();
    if (song.length >= 1) return { song: song.slice(0, 120), dance };
  }
  if (dance && text.length >= 1 && !/^(play|stop)/i.test(text)) return { song: text.replace(/[.!?]+$/, "").trim().slice(0, 120), dance: true };
  return null;
}

export const describeCommandsForPrompt = () => LLM_COMMAND_TYPES.join(", ");
