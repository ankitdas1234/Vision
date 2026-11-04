import { describe, it, expect } from "vitest";
import { ROBOT_HARDWARE } from "../../../src/config/robot";
import { DEFAULT_SERVO_CONFIGS, HEAD_CHANNEL, LEG_CHANNELS } from "../../../src/servos/ServoConfiguration";
import { COMMAND_PARAM_SCHEMAS } from "../../../src/packages/commands";

describe("hardware truth", () => {
  it("has exactly 3 servos: head on CH0 (positional), left leg CH1 and right leg CH2 (continuous)", () => {
    expect(ROBOT_HARDWARE.servoCount).toBe(3);
    expect(Object.keys(ROBOT_HARDWARE.channels)).toHaveLength(3);
    expect(ROBOT_HARDWARE.channels[0]).toEqual({ purpose: "HEAD", type: "POSITIONAL" });
    expect(ROBOT_HARDWARE.channels[1]).toEqual({ purpose: "LEFT_LEG", type: "CONTINUOUS" });
    expect(ROBOT_HARDWARE.channels[2]).toEqual({ purpose: "RIGHT_LEG", type: "CONTINUOUS" });
  });

  it("servo defaults match the hardware map (head sweeps the full 180 degrees)", () => {
    expect(HEAD_CHANNEL).toBe(0);
    expect(LEG_CHANNELS).toEqual({ left: 1, right: 2 });
    const head = DEFAULT_SERVO_CONFIGS[HEAD_CHANNEL];
    expect(head).toMatchObject({ type: "POSITIONAL", minAngle: 0, maxAngle: 180, centerAngle: 90 });
    expect(DEFAULT_SERVO_CONFIGS[LEG_CHANNELS.left].type).toBe("CONTINUOUS");
    expect(DEFAULT_SERVO_CONFIGS[LEG_CHANNELS.right].type).toBe("CONTINUOUS");
    expect(Object.keys(DEFAULT_SERVO_CONFIGS)).toHaveLength(3);
  });

  it("the ultrasonic sensor rides on the head", () => {
    expect(ROBOT_HARDWARE.sensors.ultrasonic.mounting).toBe("ON_HEAD");
  });

  it("there are no leg-joint commands any more", () => {
    for (const gone of ["LEFT_LEG_JOINT", "RIGHT_LEG_JOINT", "LEFT_LEG_CENTER", "RIGHT_LEG_CENTER"]) {
      expect(COMMAND_PARAM_SCHEMAS).not.toHaveProperty(gone);
    }
    expect(COMMAND_PARAM_SCHEMAS).toHaveProperty("EYE_SET");
  });
});
