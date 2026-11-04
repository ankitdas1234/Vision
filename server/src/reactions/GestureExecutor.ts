import { commandRegistry } from "../commands/CommandRegistry";
import { getHeadAngle } from "../attention/HeadController";
import type { EmotionState } from "../packages/types";

/**
 * EMBODIED GESTURES
 * -----------------
 * `MentalIntelligence`/`EmotionEngine` already decide *that* Vision is
 * curious, happy, confused, or surprised — and `ReactionEngine` already
 * produces a `gestures` list describing what should happen — but neither
 * ever reached a servo. This module is the missing link: a brief (well
 * under a second), small-amplitude turn, always relative to wherever
 * Vision currently is facing and always returning to that heading
 * afterward, so it reads as an expression rather than a takeover of
 * whatever AttentionController/HeadOrientationController is doing.
 *
 * Each step is an EYE_SET to the head servo (CH0, attention/HeadController.ts):
 * a quick, small left/right head turn. The head eases at HEAD_MAX_DEG_PER_SEC
 * (240°/s), so a ±12-20° gesture takes well under 100 ms — comfortably inside
 * each step's hold time. PHYSICAL CONSTRAINT: the head is yaw-only, left/right
 * — there is no pitch axis, so a "nod" here is a quick left-right wiggle, not
 * a disguised vertical movement.
 *
 Every step dispatches through the normal commandRegistry path — the
 * same safety checks (emergency stop, etc.) apply as to any other command.
 */

interface GestureStep {
  /** Degrees relative to wherever Vision is currently facing — never an
   * absolute angle, so a gesture always returns to (and never fights)
   * whatever AttentionController/HeadOrientationController had it doing. */
  angleOffset: number;
  holdMs: number;
}

const GESTURE_SEQUENCES = {
  // A curious little turn toward whatever caught its attention, then back
  // — like tilting an ear toward a sound, translated to this robot's
  // single yaw axis.
  CURIOUS_TILT: [
    { angleOffset: 15, holdMs: 220 },
    { angleOffset: -15, holdMs: 220 },
    { angleOffset: 0, holdMs: 0 },
  ],
  // A quick left-right-left wiggle — an affirmative, pleased "hello!"
  // standing in for a nod this robot's yaw-only head can't physically
  // do (there is no up/down servo — see the file header).
  HAPPY_WIGGLE: [
    { angleOffset: -12, holdMs: 150 },
    { angleOffset: 12, holdMs: 150 },
    { angleOffset: 0, holdMs: 0 },
  ],
  // A slower side-to-side — "hm, I'm not sure about that." This one DOES
  // map naturally onto yaw, unlike the happy wiggle above — a head-shake
  // for "no"/confusion is exactly what a single left-right servo does best.
  CONFUSED_SHAKE: [
    { angleOffset: 18, holdMs: 260 },
    { angleOffset: -18, holdMs: 320 },
    { angleOffset: 0, holdMs: 0 },
  ],
  // A sharp pull to one side and part-way back — something unexpected
  // just happened (a flinch has a direction; a straight-back recoil isn't
  // possible on a yaw-only head, so this reads as "startled and turning
  // to look" rather than "recoiling").
  SURPRISED_JOLT: [
    { angleOffset: -20, holdMs: 120 },
    { angleOffset: 5, holdMs: 150 },
    { angleOffset: 0, holdMs: 0 },
  ],
  // A sharp turn away and only part-way back — a "hmph". Longer holds
  // than any other gesture here on purpose: the point is that it lingers
  // slightly too long to be mistaken for a glance.
  ANNOYED_TURN_AWAY: [
    { angleOffset: -28, holdMs: 420 },
    { angleOffset: -16, holdMs: 260 },
    { angleOffset: 0, holdMs: 0 },
  ],
  // A slower, more deliberate double-look than LOW_LIGHT_PEER — held
  // longer on each side, because this plays while Vision is actively
  // checking whether whoever just said "emergency stop" is really an
  // admin, not idly scanning a dark room. Distinct on purpose: someone
  // watching should be able to tell "I'm checking something serious"
  // apart from "it's just dim in here."
  ADMIN_CHECK_SCAN: [
    { angleOffset: 26, holdMs: 500 },
    { angleOffset: -26, holdMs: 500 },
    { angleOffset: 0, holdMs: 200 },
  ],
  // A slow look one way then the other — Vision scanning a dark room for
  // whoever it just asked to turn the light on. Slower and wider than
  // CURIOUS_TILT because in the dark it genuinely can't see them.
  LOW_LIGHT_PEER: [
    { angleOffset: 22, holdMs: 340 },
    { angleOffset: -22, holdMs: 340 },
    { angleOffset: 0, holdMs: 0 },
  ],
  // A tiny single-direction fidget so a long idle stretch reads as "still
  // here, just bored" rather than frozen/dead.
  IDLE_FIDGET: [
    { angleOffset: 8, holdMs: 300 },
    { angleOffset: 0, holdMs: 0 },
  ],
  // A sharp, quick pull one way then decisively the other, back to
  // center — a flinch-and-warn, distinct from every gesture above:
  // shorter holds than CONFUSED_SHAKE (this isn't puzzlement, it's
  // immediate), and unlike SURPRISED_JOLT's partial return, this one DOES
  // return fully to center — the point isn't lingering startlement, it's
  // "back off" delivered once, sharply, then done. Paired with an
  // AUDIO_SPEAK line ("please don't touch me") by whatever calls this —
  // see people/TouchProximityAssistance.ts for the (proxy, no real touch
  // sensor exists) trigger condition.
  DONT_TOUCH_RECOIL: [
    { angleOffset: -22, holdMs: 120 },
    { angleOffset: 22, holdMs: 160 },
    { angleOffset: 0, holdMs: 0 },
  ],
} satisfies Record<string, GestureStep[]>;

export type GestureName = keyof typeof GESTURE_SEQUENCES;

function clampAngle(angle: number): number {
  return Math.max(0, Math.min(180, angle));
}

async function playSequence(robotId: string, baseAngle: number, sequence: GestureStep[]) {
  for (const step of sequence) {
    const angle = clampAngle(baseAngle + step.angleOffset);
    await commandRegistry.dispatch({ type: "EYE_SET", params: { angle }, source: "SYSTEM", robotId, isAdmin: true });
    if (step.holdMs > 0) await new Promise((r) => setTimeout(r, step.holdMs));
  }
}

/** Picks at most one gesture for the current emotion/decision and plays
 * it. Returns null (and does nothing) for states with no matching
 * gesture — most cycles are silent on purpose; a robot that gestures on
 * literally every frame reads as twitchy, not expressive. Never throws —
 * a missed gesture should never break a brain cycle. */
export async function playEmbodiedGesture(robotId: string, emotion: EmotionState, decisionType: string): Promise<GestureName | null> {
  let gesture: GestureName | null = null;
  // Checked first: if Vision is annoyed, that's what shows, regardless of
  // what the decision layer would otherwise have expressed.
  if (emotion === "ANNOYED") gesture = "ANNOYED_TURN_AWAY";
  else if (emotion === "SURPRISED") gesture = "SURPRISED_JOLT";
  else if (emotion === "CONFUSED") gesture = "CONFUSED_SHAKE";
  else if (decisionType === "GREET" && (emotion === "HAPPY" || emotion === "EXCITED")) gesture = "HAPPY_WIGGLE";
  else if (decisionType === "INVESTIGATE" && emotion === "CURIOUS") gesture = "CURIOUS_TILT";

  if (!gesture) return null;
  try {
    const baseAngle = getHeadAngle();
    await playSequence(robotId, baseAngle, GESTURE_SEQUENCES[gesture]);
    return gesture;
  } catch {
    return null;
  }
}

/** Plays one named gesture directly, for callers that already know which
 * expression they want (a low-light request, a repeated-question
 * pushback) rather than deriving it from emotion + decision. Same
 * best-effort contract as everything else here — never throws. */
export async function playGesture(robotId: string, gesture: GestureName): Promise<boolean> {
  try {
    const baseAngle = getHeadAngle();
    await playSequence(robotId, baseAngle, GESTURE_SEQUENCES[gesture]);
    return true;
  } catch {
    return false;
  }
}

export async function playIdleFidget(robotId: string): Promise<void> {
  try {
    const baseAngle = getHeadAngle();
    await playSequence(robotId, baseAngle, GESTURE_SEQUENCES.IDLE_FIDGET);
  } catch {
    // Best-effort — an idle fidget is cosmetic, never worth surfacing an error for.
  }
}
