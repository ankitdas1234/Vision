import { describe, it, expect, beforeEach } from "vitest";
import { ServoManager } from "../../../src/servos/ServoManager";
import { ServoLimitError } from "../../../src/servos/positionalServo";
import { getHeadAngle, setHeadAngle, centerHead } from "../../../src/attention/HeadController";

describe("HeadController (CH0, 180-degree human-style head)", () => {
  let servos: ServoManager;
  beforeEach(() => { servos = new ServoManager(); });

  it("starts looking straight ahead", () => {
    expect(getHeadAngle(servos)).toBe(90);
  });

  it("turns to any angle across the full 0-180 range", () => {
    expect(setHeadAngle(0, servos)).toBe(0);
    expect(setHeadAngle(180, servos)).toBe(180);
    expect(setHeadAngle(45, servos)).toBe(45);
    expect(getHeadAngle(servos)).toBe(45);
  });

  it("recentres", () => {
    setHeadAngle(160, servos);
    expect(centerHead(servos)).toBe(90);
  });

  it("refuses angles outside the servo's mechanical limits", () => {
    expect(() => setHeadAngle(181, servos)).toThrow(ServoLimitError);
    expect(() => setHeadAngle(-1, servos)).toThrow(ServoLimitError);
  });

  it("SERVOS_SAFE-style allSafe() recentres the head and stops both legs", () => {
    setHeadAngle(20, servos);
    servos.getContinuous(1).forward(50);
    servos.getContinuous(2).forward(50);
    servos.allSafe();
    expect(getHeadAngle(servos)).toBe(90);
    expect(servos.getContinuous(1).state.direction).toBe("STOP");
    expect(servos.getContinuous(2).state.direction).toBe("STOP");
  });
});
