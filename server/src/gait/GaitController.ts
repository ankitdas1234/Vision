import { ServoManager } from "../servos/ServoManager";
import { LEG_CHANNELS } from "../servos/ServoConfiguration";
import { validateGaitConfig } from "./gaitSafety";
import { ultrasonicController } from "../ultrasonic/UltrasonicController";
import { DEFAULT_WALK_FORWARD, DEFAULT_WALK_BACKWARD, DEFAULT_TURN_LEFT, DEFAULT_TURN_RIGHT, type GaitConfig } from "./GaitConfiguration";

export type GaitState = "STOPPED" | "WALKING_FORWARD" | "WALKING_BACKWARD" | "TURNING_LEFT" | "TURNING_RIGHT";

/**
 * Coordinates the two leg servos (CH1 left, CH2 right — both continuous
 * rotation) phase-by-phase. This is the server-side orchestrator; the
 * ESP32-CAM firmware runs an equivalent lower-level GaitController for
 * latency-sensitive execution.
 *
 * Walking = both legs the same way; turning the body = legs opposite ways.
 * Looking around is the HEAD servo's job (CH0, attention/HeadController.ts),
 * which is a separate servo — so the robot can look around while walking
 * and the two never compete.
 */
export class GaitController {
  private state: GaitState = "STOPPED";
  private cancelled = false;
  constructor(private servos: ServoManager) {}

  get gaitState() { return this.state; }

  async run(cfg: GaitConfig, state: GaitState, durationMs?: number) {
    validateGaitConfig(cfg);
    this.state = state;
    this.cancelled = false;

    const leftRotation = this.servos.getContinuous(LEG_CHANNELS.left);
    const rightRotation = this.servos.getContinuous(LEG_CHANNELS.right);

    const start = Date.now();
    let phaseIndex = 0;
    while (!this.cancelled) {
      // Re-checked every phase, not just at dispatch time — an obstacle
      // appearing mid-walk must stop the robot before the next phase applies.
      if (!ultrasonicController.isMovementSafe()) {
        this.stop();
        break;
      }
      if (durationMs && Date.now() - start >= durationMs) break;

      const phase = cfg.phases[phaseIndex % cfg.phases.length];

      if (phase.leftRotationDirection === "STOP") leftRotation.stop();
      else if (phase.leftRotationDirection === "FORWARD") leftRotation.forward(phase.leftRotationSpeed);
      else leftRotation.reverse(phase.leftRotationSpeed);

      if (phase.rightRotationDirection === "STOP") rightRotation.stop();
      else if (phase.rightRotationDirection === "FORWARD") rightRotation.forward(phase.rightRotationSpeed);
      else rightRotation.reverse(phase.rightRotationSpeed);

      await new Promise((r) => setTimeout(r, phase.durationMs));
      phaseIndex++;
      if (!durationMs && phaseIndex >= cfg.phases.length * 2) break; // bounded default run
    }
    this.stop();
  }

  walkForward(durationMs?: number) { return this.run(DEFAULT_WALK_FORWARD, "WALKING_FORWARD", durationMs); }
  walkBackward(durationMs?: number) { return this.run(DEFAULT_WALK_BACKWARD, "WALKING_BACKWARD", durationMs); }
  turnLeft(durationMs?: number) { return this.run(DEFAULT_TURN_LEFT, "TURNING_LEFT", durationMs); }
  turnRight(durationMs?: number) { return this.run(DEFAULT_TURN_RIGHT, "TURNING_RIGHT", durationMs); }

  stop() {
    this.cancelled = true;
    this.state = "STOPPED";
    this.servos.getContinuous(LEG_CHANNELS.left).stop();
    this.servos.getContinuous(LEG_CHANNELS.right).stop();
  }
}
