import { PositionalServo } from "./positionalServo";
import { ContinuousServo } from "./continuousServo";
import { DEFAULT_SERVO_CONFIGS, type ServoConfig } from "./ServoConfiguration";

/**
 * Server-side representation of Vision's 3 servos (head CH0, left leg CH1, right leg CH2). This does NOT talk to hardware
 * directly (that's the ESP32-CAM's job) — it validates requests, tracks
 * desired state, and produces the command payload sent over the RobotTransport.
 */
export class ServoManager {
  private positional = new Map<number, PositionalServo>();
  private continuous = new Map<number, ContinuousServo>();

  constructor(configs: Record<number, ServoConfig> = DEFAULT_SERVO_CONFIGS) {
    for (const cfg of Object.values(configs)) {
      if (cfg.type === "POSITIONAL") this.positional.set(cfg.channel, new PositionalServo(cfg));
      else this.continuous.set(cfg.channel, new ContinuousServo(cfg));
    }
  }

  getPositional(channel: number): PositionalServo {
    const s = this.positional.get(channel);
    if (!s) throw new Error(`No positional servo configured on channel ${channel}`);
    return s;
  }

  getContinuous(channel: number): ContinuousServo {
    const s = this.continuous.get(channel);
    if (!s) throw new Error(`No continuous servo configured on channel ${channel}`);
    return s;
  }

  allSafe() {
    this.positional.forEach((s) => s.safe());
    this.continuous.forEach((s) => s.safe());
  }

  snapshot() {
    return {
      positional: [...this.positional.values()].map((s) => ({ channel: s.channel, angle: s.angle })),
      continuous: [...this.continuous.values()].map((s) => ({ channel: s.channel, ...s.state })),
    };
  }
}

export const servoManager = new ServoManager();
