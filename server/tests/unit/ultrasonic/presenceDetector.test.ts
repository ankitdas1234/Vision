import { describe, it, expect } from "vitest";
import { detectPresenceEvent, trackPresence, resetPresenceTrackingFor } from "../../../src/ultrasonic/PresenceDetector";
import type { UltrasonicReading } from "../../../src/packages/types";

function reading(distanceMm: number, status: UltrasonicReading["status"] = "CLEAR"): UltrasonicReading {
  return { rawDistanceMm: distanceMm, filteredDistanceMm: distanceMm, confidence: 1, status, timestamp: new Date().toISOString() };
}

describe("detectPresenceEvent (peripheral proximity sense)", () => {
  it("reports NONE when nothing is near and nothing changed", () => {
    const event = detectPresenceEvent(reading(2000), reading(1950));
    expect(event.type).toBe("NONE");
  });

  it("reports ENTERED_NEAR_FIELD when something crosses into range gradually", () => {
    const event = detectPresenceEvent(reading(950), reading(850));
    expect(event.type).toBe("ENTERED_NEAR_FIELD");
  });

  it("reports LEFT_NEAR_FIELD when something moves back out of range", () => {
    const event = detectPresenceEvent(reading(500), reading(1500));
    expect(event.type).toBe("LEFT_NEAR_FIELD");
  });

  it("reports SUDDEN_APPROACH on a large one-sample closing jump, even while already near", () => {
    const event = detectPresenceEvent(reading(800), reading(400));
    expect(event.type).toBe("SUDDEN_APPROACH");
  });

  it("treats the very first reading as an entry event if already within range", () => {
    const event = detectPresenceEvent(null, reading(700));
    expect(event.type).toBe("ENTERED_NEAR_FIELD");
  });

  it("ignores invalid/error readings rather than firing a false event", () => {
    const event = detectPresenceEvent(reading(2000), reading(0, "SENSOR_ERROR"));
    expect(event.type).toBe("NONE");
  });
});

describe("trackPresence (per-robot state)", () => {
  it("remembers the previous reading between calls for the same robot", () => {
    resetPresenceTrackingFor("robot-a");
    trackPresence("robot-a", reading(950));
    const event = trackPresence("robot-a", reading(850));
    expect(event.type).toBe("ENTERED_NEAR_FIELD");
  });
});
