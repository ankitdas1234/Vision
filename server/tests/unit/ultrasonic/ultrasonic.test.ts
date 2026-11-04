import { describe, it, expect } from "vitest";
import { UltrasonicFilter } from "../../../src/ultrasonic/UltrasonicFilter";
import { classifyDistance, isMovementSafe, DEFAULT_ULTRASONIC_THRESHOLDS } from "../../../src/ultrasonic/UltrasonicSafety";
import { UltrasonicService } from "../../../src/ultrasonic/UltrasonicService";

describe("ultrasonic distance calculation & classification", () => {
  it("classifies a clear path", () => {
    expect(classifyDistance(1000, DEFAULT_ULTRASONIC_THRESHOLDS)).toBe("CLEAR");
  });

  it("classifies within warning range", () => {
    expect(classifyDistance(250, DEFAULT_ULTRASONIC_THRESHOLDS)).toBe("WARNING");
  });

  it("classifies an obstacle at stop distance", () => {
    expect(classifyDistance(100, DEFAULT_ULTRASONIC_THRESHOLDS)).toBe("OBSTACLE");
  });

  it("classifies emergency distance as VERY_CLOSE", () => {
    expect(classifyDistance(20, DEFAULT_ULTRASONIC_THRESHOLDS)).toBe("VERY_CLOSE");
  });

  it("treats invalid/negative readings as INVALID (timeout handling)", () => {
    expect(classifyDistance(null)).toBe("INVALID");
    expect(classifyDistance(-5)).toBe("INVALID");
  });

  it("movement is only safe when CLEAR or NEAR", () => {
    expect(isMovementSafe("CLEAR")).toBe(true);
    expect(isMovementSafe("NEAR")).toBe(true);
    expect(isMovementSafe("WARNING")).toBe(false);
    expect(isMovementSafe("OBSTACLE")).toBe(false);
    expect(isMovementSafe("VERY_CLOSE")).toBe(false);
  });
});

describe("ultrasonic filtering", () => {
  it("smooths out a single noisy spike", () => {
    const filter = new UltrasonicFilter(5);
    [1000, 1010, 990, 1005].forEach((v) => filter.push(v));
    const spikedFiltered = filter.push(50); // sudden spike/noise sample
    // Median-weighted blend should stay much closer to ~1000 than to the 50mm spike.
    expect(spikedFiltered).toBeGreaterThan(500);
  });

  it("confidence increases with more consistent samples", () => {
    const filter = new UltrasonicFilter(5);
    [1000, 1000, 1000, 1000, 1000].forEach((v) => filter.push(v));
    expect(filter.confidence()).toBeGreaterThan(0.8);
  });
});

describe("UltrasonicService end-to-end", () => {
  it("rejects an out-of-range raw reading as INVALID", () => {
    const svc = new UltrasonicService();
    const reading = svc.ingest(9000); // beyond ~4.5m HC-SR04 reliable range
    expect(reading.status).toBe("INVALID");
  });

  it("disabling the sensor reports SENSOR_ERROR", () => {
    const svc = new UltrasonicService();
    svc.disable();
    const reading = svc.ingest(1000);
    expect(reading.status).toBe("SENSOR_ERROR");
  });

  it("a close reading triggers OBSTACLE/STOP classification", () => {
    const svc = new UltrasonicService();
    const reading = svc.ingest(100);
    expect(["OBSTACLE", "VERY_CLOSE"]).toContain(reading.status);
  });
});
