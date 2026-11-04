import type { PositionalServoConfig } from "./ServoConfiguration";

export class ServoLimitError extends Error {
  code = "SERVO_LIMIT_EXCEEDED";
  constructor(msg: string) { super(msg); }
}

/**
 * Software model of a POSITIONAL servo (the head, CH0).
 * NEVER used for continuous-rotation servos — see continuousServo.ts.
 */
export class PositionalServo {
  private currentAngle: number;

  constructor(private config: PositionalServoConfig) {
    this.currentAngle = config.defaultAngle;
  }

  get channel() { return this.config.channel; }
  get angle() { return this.currentAngle; }

  /** Clamp + validate a requested angle against configured mechanical safety limits. */
  private clamp(angle: number): number {
    if (angle < this.config.minAngle || angle > this.config.maxAngle) {
      throw new ServoLimitError(
        `Channel ${this.config.channel}: angle ${angle} outside configured limits [${this.config.minAngle}, ${this.config.maxAngle}]`
      );
    }
    return this.config.directionInverted ? this.config.maxAngle - (angle - this.config.minAngle) : angle;
  }

  setAngle(angle: number): number {
    this.currentAngle = this.clamp(angle);
    return this.currentAngle;
  }

  moveTo(angle: number): number {
    return this.setAngle(angle);
  }

  center(): number {
    return this.setAngle(this.config.centerAngle);
  }

  safe(): number {
    return this.center();
  }
}
