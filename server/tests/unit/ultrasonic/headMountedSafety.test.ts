import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ultrasonicController, resetForwardReading, FORWARD_READING_MAX_AGE_MS } from "../../../src/ultrasonic/UltrasonicController";
import { servoManager } from "../../../src/servos/ServoManager";
import { setHeadAngle, centerHead } from "../../../src/attention/HeadController";

// The HC-SR04 rides on the head. With the head forward the live reading decides;
// glance away briefly and the fresh "clear ahead" reading still counts; stare
// away for longer and movement fails closed.
// The service smooths readings over a window, so settle it on a value first.
const settle = (mm: number) => { for (let i = 0; i < 20; i++) ultrasonicController.ingest(mm); };

describe("ultrasonic movement safety with a head-mounted sensor", () => {
  beforeEach(() => { vi.useFakeTimers(); centerHead(servoManager); resetForwardReading(); ultrasonicController.enable(); });
  afterEach(() => { vi.useRealTimers(); centerHead(servoManager); });

  it("head forward + clear path -> safe", () => {
    settle(2000);
    expect(ultrasonicController.isMovementSafe()).toBe(true);
  });

  it("head forward + obstacle ahead -> unsafe", () => {
    settle(100);
    expect(ultrasonicController.isMovementSafe()).toBe(false);
  });

  it("a quick glance sideways keeps a fresh clear-ahead reading valid (can look around while walking)", () => {
    settle(2000);
    setHeadAngle(150, servoManager);
    expect(ultrasonicController.isMovementSafe()).toBe(true);
  });

  it("staring sideways longer than the grace period fails closed", () => {
    settle(2000);
    setHeadAngle(150, servoManager);
    vi.advanceTimersByTime(FORWARD_READING_MAX_AGE_MS + 50);
    expect(ultrasonicController.isMovementSafe()).toBe(false);
  });

  it("an obstacle seen ahead just before the head turned is NOT forgiven by the glance rule", () => {
    settle(100);
    setHeadAngle(150, servoManager);
    expect(ultrasonicController.isMovementSafe()).toBe(false);
  });

  it("with no forward reading at all and the head turned away -> unsafe", () => {
    setHeadAngle(150, servoManager);
    expect(ultrasonicController.isMovementSafe()).toBe(false);
  });

  it("coming back to centre restores live-reading control", () => {
    settle(2000);
    setHeadAngle(150, servoManager);
    vi.advanceTimersByTime(FORWARD_READING_MAX_AGE_MS + 50);
    expect(ultrasonicController.isMovementSafe()).toBe(false);
    centerHead(servoManager);
    expect(ultrasonicController.isMovementSafe()).toBe(true);
  });
});
