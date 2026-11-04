import type { GaitConfig } from "./GaitConfiguration";

export class GaitSafetyError extends Error {
  code = "GAIT_SAFETY_VIOLATION";
}

/** Validate every phase of a gait config against safe speed bounds before execution. */
export function validateGaitConfig(cfg: GaitConfig): void {
  for (const phase of cfg.phases) {
    if (phase.leftRotationSpeed < 0 || phase.leftRotationSpeed > 100 || phase.rightRotationSpeed < 0 || phase.rightRotationSpeed > 100) {
      throw new GaitSafetyError(`Phase ${phase.phaseNumber}: rotation speed out of 0-100 range`);
    }
  }
}
