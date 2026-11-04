import { UltrasonicFilter } from "./UltrasonicFilter";
import { classifyDistance, DEFAULT_ULTRASONIC_THRESHOLDS, type UltrasonicThresholds } from "./UltrasonicSafety";
import type { UltrasonicReading, UltrasonicState } from "../packages/types";

/**
 * Server-side model of the HC-SR04. In real operation, raw echo-time
 * readings arrive from the ESP32-CAM over telemetry/heartbeat; in MOCK_MODE
 * this generates a plausible clear-path reading so the dashboard/tests work
 * without hardware.
 */
export class UltrasonicService {
  private filter = new UltrasonicFilter();
  private enabled = true;
  private thresholds: UltrasonicThresholds = DEFAULT_ULTRASONIC_THRESHOLDS;
  private lastReading: UltrasonicReading | null = null;

  isEnabled() { return this.enabled; }
  enable() { this.enabled = true; }
  disable() { this.enabled = false; }

  calibrate(patch: Partial<UltrasonicThresholds>) {
    this.thresholds = { ...this.thresholds, ...patch };
    return this.thresholds;
  }

  getThresholds() { return this.thresholds; }

  /** Ingest a raw distance sample (mm) from the robot and produce a filtered reading. */
  ingest(rawMm: number | null): UltrasonicReading {
    if (!this.enabled) {
      this.lastReading = { rawDistanceMm: 0, filteredDistanceMm: 0, confidence: 0, status: "SENSOR_ERROR", timestamp: new Date().toISOString() };
      return this.lastReading;
    }
    if (rawMm === null || rawMm < 0 || rawMm > 4500) { // HC-SR04 max reliable range ~4.5m
      this.lastReading = { rawDistanceMm: rawMm ?? -1, filteredDistanceMm: this.filter.push(this.thresholds.safeDistanceMm), confidence: 0, status: "INVALID", timestamp: new Date().toISOString() };
      return this.lastReading;
    }
    const filtered = this.filter.push(rawMm);
    const status = classifyDistance(filtered, this.thresholds);
    this.lastReading = { rawDistanceMm: rawMm, filteredDistanceMm: filtered, confidence: this.filter.confidence(), status, timestamp: new Date().toISOString() };
    return this.lastReading;
  }

  /** Mock-mode reading generator — always reports a clear path. */
  mockReading(): UltrasonicReading {
    return this.ingest(this.thresholds.safeDistanceMm + 200);
  }

  getLast(): UltrasonicReading | null { return this.lastReading; }
  /** Before any real reading has arrived, default to CLEAR (rather than blocking
   * all movement forever) so the system is usable in MOCK_MODE / before the first
   * heartbeat — but only while the sensor is enabled; disabling it blocks movement. */
  getStatus(): UltrasonicState {
    if (!this.enabled) return "SENSOR_ERROR";
    return this.lastReading?.status ?? "CLEAR";
  }
}

export const ultrasonicService = new UltrasonicService();
