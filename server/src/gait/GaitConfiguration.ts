import type { GaitPhase } from "../packages/types";

export interface GaitConfig {
  name: string;
  stepDurationMs: number;
  defaultSpeed: number;
  phases: GaitPhase[];
}

/** Conservative default 4-phase gait (two continuous leg servos: no joints). Tune via calibration UI. */
export const DEFAULT_WALK_FORWARD: GaitConfig = {
  name: "walk_forward",
  stepDurationMs: 400,
  defaultSpeed: 60,
  phases: [
    { phaseNumber: 1, durationMs: 400, leftRotationSpeed: 60, leftRotationDirection: "FORWARD", rightRotationSpeed: 60, rightRotationDirection: "FORWARD" },
    { phaseNumber: 2, durationMs: 400, leftRotationSpeed: 60, leftRotationDirection: "FORWARD", rightRotationSpeed: 60, rightRotationDirection: "FORWARD" },
    { phaseNumber: 3, durationMs: 400, leftRotationSpeed: 60, leftRotationDirection: "FORWARD", rightRotationSpeed: 60, rightRotationDirection: "FORWARD" },
    { phaseNumber: 4, durationMs: 400, leftRotationSpeed: 60, leftRotationDirection: "FORWARD", rightRotationSpeed: 60, rightRotationDirection: "FORWARD" },
  ],
};

export const DEFAULT_WALK_BACKWARD: GaitConfig = {
  ...DEFAULT_WALK_FORWARD,
  name: "walk_backward",
  phases: DEFAULT_WALK_FORWARD.phases.map((p) => ({ ...p, leftRotationDirection: "REVERSE", rightRotationDirection: "REVERSE" })),
};

export const DEFAULT_TURN_LEFT: GaitConfig = {
  ...DEFAULT_WALK_FORWARD,
  name: "turn_left",
  phases: DEFAULT_WALK_FORWARD.phases.map((p) => ({ ...p, leftRotationDirection: "REVERSE", rightRotationDirection: "FORWARD" })),
};

export const DEFAULT_TURN_RIGHT: GaitConfig = {
  ...DEFAULT_WALK_FORWARD,
  name: "turn_right",
  phases: DEFAULT_WALK_FORWARD.phases.map((p) => ({ ...p, leftRotationDirection: "FORWARD", rightRotationDirection: "REVERSE" })),
};
