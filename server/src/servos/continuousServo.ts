import type { ContinuousServoConfig } from "./ServoConfiguration";

export type RotationDirection = "FORWARD" | "REVERSE" | "STOP";

/**
 * Software model of a CONTINUOUS ROTATION servo (left/right leg rotation).
 * Speed/direction based — NEVER controlled via setAngle().
 */
export class ContinuousServo {
  private speed = 0; // 0-100
  private direction: RotationDirection = "STOP";

  constructor(private config: ContinuousServoConfig) {}

  get channel() { return this.config.channel; }
  get state() { return { speed: this.speed, direction: this.direction }; }

  /** Convert current speed/direction into a PWM value using calibrated neutral + range. */
  toPwm(): number {
    if (this.direction === "STOP" || this.speed === 0) return this.config.neutralPwm;
    const range = this.config.maxPwm - this.config.neutralPwm;
    const effectiveDir = this.config.directionInverted
      ? (this.direction === "FORWARD" ? "REVERSE" : "FORWARD")
      : this.direction;
    const magnitude = (Math.min(100, Math.max(0, this.speed)) / 100) * range;
    return effectiveDir === "FORWARD" ? this.config.neutralPwm + magnitude : this.config.neutralPwm - magnitude;
  }

  setSpeed(speed: number) {
    this.speed = Math.min(100, Math.max(0, speed));
    if (this.speed === 0) this.direction = "STOP";
    return this.toPwm();
  }

  forward(speed = this.config.defaultSpeed) {
    this.direction = "FORWARD";
    return this.setSpeed(speed);
  }

  reverse(speed = this.config.defaultSpeed) {
    this.direction = "REVERSE";
    return this.setSpeed(speed);
  }

  stop() {
    this.direction = "STOP";
    this.speed = 0;
    return this.config.neutralPwm;
  }

  safe() {
    return this.stop();
  }
}
