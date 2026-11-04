/**
 * DANCE CHOREOGRAPHY
 * ------------------
 * Two modes:
 *   - `generateDanceSequence` — fixed-tempo, used when no audio file is
 *     involved ("Vision, dance!" with nothing to play). Honest about
 *     what it is: a procedural, repeating sequence, not synced to
 *     anything.
 *   - `generateBeatSyncedDanceSequence` — genuinely synced to a specific
 *     track's real detected beats (see audio/beatDetection.ts, which
 *     runs actual DSP — energy-flux onset detection + autocorrelation
 *     tempo estimation — on the real decoded audio, not a guessed or
 *     hardcoded tempo). Used by performance/DanceRunner.ts's
 *     runDanceToBeats when a user-supplied audio file is being played
 *     (see music/MusicUploadService.ts — there's still no pipeline for
 *     pulling audio from YouTube/Spotify/etc., only from a file the
 *     user actually uploads, since that's the only source that's both
 *     legally playable and technically get-able as real audio bytes).
 *
 * PHYSICAL BODY — 3 servos (see servos/ServoConfiguration.ts): head (CH0,
 * positional 0-180°), left leg (CH1) and right leg (CH2), both continuous.
 * `eyeAngle` is dispatched as EYE_SET to the head servo, concurrently with
 * the leg speeds — head and legs are separate servos, so a frame can turn
 * the head AND drive the legs in one beat.
 */

export interface DanceFrame {
  /** Head angle, 0-180°, 90° = looking straight ahead. Dispatched as EYE_SET. */
  eyeAngle: number;
  /** Left leg rotation speed, -100..100 (negative = reverse direction,
   * see servos/continuousServo.ts). This is a continuous servo — it
   * spins rather than holding a position, so a nonzero value here means
   * "keep spinning at this speed for holdMs", not "move to this angle". */
  leftRotationSpeed: number;
  /** Right leg rotation speed, -100..100. */
  rightRotationSpeed: number;
  holdMs: number;
}

export const DANCE_FRAME_HOLD_MS = 400;
export const DEFAULT_DANCE_DURATION_MS = 15_000;

const MOVES: Record<string, Omit<DanceFrame, "holdMs">> = {
  // WIGGLE_LEFT: facing turned left, legs bent asymmetrically (left leg
  // more folded than right), both leg-rotation servos spinning the same
  // direction as each other but opposite to WIGGLE_RIGHT below — the legs
  // both "step" the same way while the body leans, which is what makes
  // this read as a side-to-side sway rather than actually walking forward.
  WIGGLE_LEFT: { eyeAngle: 60, leftRotationSpeed: 40, rightRotationSpeed: -40 },
  // WIGGLE_RIGHT: the mirror image of WIGGLE_LEFT — facing turned right,
  // joint bend reversed, rotation direction reversed. Alternating
  // WIGGLE_LEFT/WIGGLE_RIGHT is the basic "sway side to side" beat.
  WIGGLE_RIGHT: { eyeAngle: 120, leftRotationSpeed: -40, rightRotationSpeed: 40 },
  // SPIN: facing centered, both joints level, both rotation servos spinning
  // the SAME direction at a higher speed — since both legs push the same
  // way at once, this is the move most likely to actually turn the whole
  // body in place, like a little in-place spin/twirl.
  SPIN: { eyeAngle: 90, leftRotationSpeed: 60, rightRotationSpeed: 60 },
  // BOUNCE: facing centered, joints splayed apart (one folded, one
  // extended) with both rotation servos spinning OPPOSITE directions at
  // higher speed — an energetic, less directional wiggle to punctuate a
  // sequence of sways, reading as a "bounce" beat.
  BOUNCE: { eyeAngle: 90, leftRotationSpeed: -60, rightRotationSpeed: -60 },
};

/** The actual beat pattern — deliberately simple and repeating (sway
 * left, sway right, spin, bounce) rather than random, so the dance reads
 * as intentional choreography rather than servo noise. */
const SEQUENCE_ORDER = ["WIGGLE_LEFT", "WIGGLE_RIGHT", "SPIN", "BOUNCE"] as const;

/** Generates a frame-by-frame sequence long enough to fill `durationMs`,
 * cycling through the beat pattern above. Deterministic — same duration
 * always produces the same sequence, which is what makes this
 * straightforward to test. */
export function generateDanceSequence(durationMs: number, frameHoldMs: number = DANCE_FRAME_HOLD_MS): DanceFrame[] {
  const boundedDuration = Math.max(frameHoldMs, durationMs);
  const frameCount = Math.round(boundedDuration / frameHoldMs);
  const frames: DanceFrame[] = [];
  for (let i = 0; i < frameCount; i++) {
    const move = MOVES[SEQUENCE_ORDER[i % SEQUENCE_ORDER.length]];
    frames.push({ ...move, holdMs: frameHoldMs });
  }
  return frames;
}

/**
 * Generates a dance sequence where each move change lands on a real
 * detected beat timestamp (see audio/beatDetection.ts) instead of a
 * fixed interval — this is what makes DanceRunner.runDanceToBeats
 * genuinely synced to a specific track's actual rhythm rather than a
 * generic tempo. `beatTimestampsMs` must be sorted ascending and
 * relative to the same t=0 as the audio playback it'll run alongside.
 *
 * One move per beat: each frame's `holdMs` is the real gap to the next
 * beat (or MIN_HOLD_MS if beats are packed tighter than the hardware can
 * usefully react to — a very fast track shouldn't try to change pose
 * faster than the servos can physically move).
 */
const MIN_HOLD_MS = 150;

export function generateBeatSyncedDanceSequence(beatTimestampsMs: number[]): DanceFrame[] {
  if (beatTimestampsMs.length === 0) return [];

  const frames: DanceFrame[] = [];
  for (let i = 0; i < beatTimestampsMs.length; i++) {
    const move = MOVES[SEQUENCE_ORDER[i % SEQUENCE_ORDER.length]];
    const nextBeat = beatTimestampsMs[i + 1];
    const holdMs = nextBeat !== undefined ? Math.max(MIN_HOLD_MS, nextBeat - beatTimestampsMs[i]) : DANCE_FRAME_HOLD_MS;
    frames.push({ ...move, holdMs });
  }
  return frames;
}
