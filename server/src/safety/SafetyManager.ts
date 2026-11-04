import { requiresSafetyCheck } from "./safetyRules";
import { ultrasonicController } from "../ultrasonic/UltrasonicController";
import type { CommandType } from "../packages/types";
import { MOVEMENT_COMMANDS, HARDWARE_COMMANDS } from "../packages/commands";
import { robotConnection } from "../robot/RobotConnection";
import { env } from "../config/env";

export class SafetyViolationError extends Error {
  code = "SAFETY_VALIDATION_FAILED";
}

/**
 * Highest-priority gate. Priority order (see docs/safety.md):
 * 1. Emergency stop  2. Physical/ultrasonic safety  3. Hardware limits
 * (enforced in servo/gait layers)  4. Authorization (CommandValidator)
 * 5+ everything else. Mental Intelligence, the Decision Maker, Reaction
 * Engine, OpenRouter, Vision Script, and the frontend cannot override this.
 */
export class SafetyManager {
  private emergencyActive = false;

  isEmergencyActive() { return this.emergencyActive; }
  setEmergency(active: boolean) { this.emergencyActive = active; }

  /** Every hardware command must pass through here before execution. */
  check(type: CommandType) {
    if (this.emergencyActive && type !== "EMERGENCY_STOP" && type !== "SERVOS_SAFE" && type !== "EMERGENCY_CLEAR") {
      throw new SafetyViolationError(`Command ${type} rejected: emergency stop is active`);
    }

    if (MOVEMENT_COMMANDS.has(type) && !ultrasonicController.isMovementSafe()) {
      throw new SafetyViolationError(`Command ${type} rejected: ultrasonic sensor reports an unsafe obstacle distance (status: ${ultrasonicController.status()})`);
    }

    // In a real (non-MOCK_MODE) deployment, don't accept hardware commands
    // when the robot hasn't sent a heartbeat recently (RobotConnection marks
    // itself OFFLINE after 15s of silence — see telemetry.routes.ts). Without
    // this, a WALK_FORWARD sent while the robot is disconnected/rebooting
    // just silently no-ops on the (absent) hardware instead of failing
    // loudly. Skipped entirely in MOCK_MODE, which has no heartbeat source,
    // and never applied to the emergency commands themselves — those must
    // always be dispatchable regardless of connection state.
    if (
      !env.MOCK_MODE &&
      HARDWARE_COMMANDS.has(type) &&
      type !== "EMERGENCY_STOP" &&
      type !== "SERVOS_SAFE" &&
      robotConnection.getStatus() === "OFFLINE"
    ) {
      throw new SafetyViolationError(`Command ${type} rejected: robot is offline (no heartbeat received recently)`);
    }

    if (requiresSafetyCheck(type)) {
      // Additional per-command physical safety checks are enforced inside the
      // servo/gait layers themselves (angle limits, speed bounds, etc).
      return true;
    }
    return true;
  }
}

export const safetyManager = new SafetyManager();
