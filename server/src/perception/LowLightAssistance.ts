/**
 * "IT'S TOO DARK — CAN YOU HELP?"
 * ------------------------------
 * The pre-attentive filter (camera/imageProcessor.ts) already throws away
 * frames that are too dark to be worth analyzing, but throwing them away
 * silently is the wrong behavior when a person is standing right there:
 * a human in a dark room doesn't just keep squinting, they ask whoever's
 * next to the switch to turn the light on.
 *
 * This module is that ask. It is deliberately tiny and stateless apart
 * from a per-robot cooldown/attempt counter, because the only genuinely
 * hard parts (measuring brightness, knowing whether someone is present)
 * are already solved elsewhere and passed in.
 *
 * TWO PRESENCE SOURCES, ON PURPOSE: in a properly dark room the camera
 * often CAN'T see the person it wants to ask — that's the whole problem.
 * So ultrasonic proximity counts as "someone is there" just as much as a
 * visual person detection does. Asking an empty room to turn a light on
 * would be the one genuinely silly failure mode here, and requiring at
 * least one of these two signals is what prevents it.
 */

/** Below this mean luminance (0-255) Vision can technically still capture
 * frames but recognition quality falls apart. Set well ABOVE the
 * `minBrightness: 12` hard-discard threshold in imageProcessor.ts — by the
 * time frames are being discarded outright it's far too late to be asking
 * politely. */
export const DIM_BRIGHTNESS_THRESHOLD = 55;

/** Hysteresis: the light has to come up meaningfully (not just flicker one
 * grey level over the threshold) before the attempt counter resets and
 * Vision is willing to start asking again. Without the gap, a room sitting
 * exactly at the threshold would re-arm the whole escalation every frame. */
export const RECOVERED_BRIGHTNESS_THRESHOLD = 75;

/** Brain cycles run about once a second — without a cooldown this would
 * ask sixty times a minute. */
export const ASK_COOLDOWN_MS = 90 * 1000;

/** After this many unanswered asks Vision stops and just waits. Nobody
 * likes being nagged, and if two requests haven't worked the third won't
 * either — the person has presumably decided the dark is fine. */
export const MAX_ASK_ATTEMPTS = 3;

export interface LowLightInput {
  robotId: string;
  /** From FrameQuality.meanBrightness (camera/imageProcessor.ts). */
  meanBrightness: number;
  /** From FrameQuality.isReadable — a corrupt/undecodable frame reports
   * brightness 0, which is a broken camera link, NOT a dark room. Asking
   * someone to open a window won't fix a dead cable. */
  frameReadable: boolean;
  personDetected: boolean;
  /** Ultrasonic says something is within near-field range — the fallback
   * presence signal for exactly the case where it's too dark to see. */
  someoneCloseOnUltrasonic: boolean;
  now?: number;
}

export interface LowLightPrompt {
  text: string;
  /** 1-based: which ask this is in the current dark stretch. */
  attempt: number;
}

interface RobotLowLightState {
  attempts: number;
  lastAskedAtMs: number;
}

const stateByRobot = new Map<string, RobotLowLightState>();

/** Escalating, never scolding — the person hasn't done anything wrong, the
 * room is just dark. The last one stops asking and says so, rather than
 * trailing off silently and leaving them wondering. */
const PROMPTS = [
  "It's quite dark in here and I can't see properly. Could you turn a light on, or open the curtains?",
  "I still can't see much — would you mind opening a door or a window to let some light in?",
  "It's still too dark for me to see properly. I'll stop asking and just wait until there's more light.",
];

function getState(robotId: string): RobotLowLightState {
  let state = stateByRobot.get(robotId);
  if (!state) {
    state = { attempts: 0, lastAskedAtMs: 0 };
    stateByRobot.set(robotId, state);
  }
  return state;
}

/**
 * Returns the line Vision should say, or null (the overwhelmingly common
 * case — well-lit room, nobody around, still cooling down, or already
 * asked enough times). Pure apart from the per-robot cooldown state, so
 * the caller can just push the returned text at AUDIO_SPEAK.
 */
export function evaluateLowLight(input: LowLightInput): LowLightPrompt | null {
  const now = input.now ?? Date.now();
  const state = getState(input.robotId);

  // A frame that couldn't be decoded tells us nothing about the lighting.
  if (!input.frameReadable) return null;

  // Light came back — re-arm for next time, say nothing now.
  if (input.meanBrightness >= RECOVERED_BRIGHTNESS_THRESHOLD) {
    state.attempts = 0;
    state.lastAskedAtMs = 0;
    return null;
  }

  if (input.meanBrightness >= DIM_BRIGHTNESS_THRESHOLD) return null;
  if (!input.personDetected && !input.someoneCloseOnUltrasonic) return null; // nobody to ask
  if (state.attempts >= MAX_ASK_ATTEMPTS) return null;
  if (state.lastAskedAtMs > 0 && now - state.lastAskedAtMs < ASK_COOLDOWN_MS) return null;

  state.attempts += 1;
  state.lastAskedAtMs = now;
  return { text: PROMPTS[state.attempts - 1], attempt: state.attempts };
}

/** Test/reset hook — also useful if a robot is re-seeded at runtime. */
export function resetLowLightState(robotId?: string) {
  if (robotId) stateByRobot.delete(robotId);
  else stateByRobot.clear();
}
