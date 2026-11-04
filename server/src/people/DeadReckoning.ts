/**
 * DEAD-RECKONING RETURN PATH
 * --------------------------
 * There is no map, localization, or encoder feedback anywhere in this
 * codebase (see docs/people.md "Known limitations") — this is NOT real
 * navigation. What it IS: basic open-loop dead reckoning. If a robot
 * walked forward for 3.5s then turned left for 3.5s then walked forward
 * again, retracing that back to where it started means undoing those
 * moves in REVERSE ORDER, each one INVERTED:
 *
 *   walked forward  -> to undo: walk backward (same duration)
 *   turned left      -> to undo: turn right (same duration)
 *
 * and undoing "A then B then C" means doing "undo(C), undo(B), undo(A)" —
 * reverse the sequence, not just invert each step in place.
 *
 * This is a genuine improvement over guessing a fixed return route (the
 * previous behavior — see git history / PersonSearchRunner.ts), but it's
 * still approximate: there's no wheel-encoder feedback, so motor
 * speed/slip differences between forward and backward motion, and between
 * individual servos, mean small errors accumulate over a long patrol and
 * are never corrected. Good enough to generally head back the right way
 * in a small room over a few dozen steps; not a substitute for real
 * localization over a large area or a long search.
 */

export type PatrolMoveType = "WALK_FORWARD" | "TURN_LEFT";
export type ReturnMoveType = "WALK_BACKWARD" | "TURN_RIGHT";

export interface PatrolStep {
  type: PatrolMoveType;
  durationMs: number;
}

export interface ReturnStep {
  type: ReturnMoveType;
  durationMs: number;
}

function invert(type: PatrolMoveType): ReturnMoveType {
  return type === "WALK_FORWARD" ? "WALK_BACKWARD" : "TURN_RIGHT";
}

/** Builds the return path for a recorded patrol — reverse order, each
 * step inverted. An empty log (e.g. found on the very first look, before
 * taking any patrol steps) correctly produces an empty return path — there's
 * nothing to retrace. */
export function buildReturnPath(patrolLog: PatrolStep[]): ReturnStep[] {
  const reversed = [...patrolLog].reverse();
  return reversed.map((step) => ({ type: invert(step.type), durationMs: step.durationMs }));
}
