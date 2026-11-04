import { describe, it, expect } from "vitest";
import { ContinuousServo } from "../../../src/servos/continuousServo";
import { PositionalServo, ServoLimitError } from "../../../src/servos/positionalServo";

const continuousConfig = { channel: 1, type: "CONTINUOUS" as const, neutralPwm: 300, minPwm: 200, maxPwm: 400, defaultSpeed: 50, directionInverted: false };
const positionalConfig = { channel: 2, type: "POSITIONAL" as const, minAngle: 0, maxAngle: 180, centerAngle: 90, defaultAngle: 90, directionInverted: false };

describe("continuous servo", () => {
  it("TEST 5: forward -> correct direction (pwm above neutral)", () => {
    const s = new ContinuousServo(continuousConfig);
    s.forward(50);
    expect(s.toPwm()).toBeGreaterThan(continuousConfig.neutralPwm);
  });

  it("TEST 6: reverse -> correct direction (pwm below neutral)", () => {
    const s = new ContinuousServo(continuousConfig);
    s.reverse(50);
    expect(s.toPwm()).toBeLessThan(continuousConfig.neutralPwm);
  });

  it("TEST 7: stop -> neutral pwm", () => {
    const s = new ContinuousServo(continuousConfig);
    s.forward(80);
    s.stop();
    expect(s.toPwm()).toBe(continuousConfig.neutralPwm);
  });
});

describe("positional servo", () => {
  it("TEST 8: beyond limit -> rejected", () => {
    const s = new PositionalServo(positionalConfig);
    expect(() => s.setAngle(200)).toThrow(ServoLimitError);
  });
});
