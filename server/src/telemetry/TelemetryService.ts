import type { TelemetrySnapshot } from "../packages/types";

export class TelemetryService {
  private history: TelemetrySnapshot[] = [];

  record(snapshot: TelemetrySnapshot) {
    this.history.push({ ...snapshot, createdAt: new Date().toISOString() });
    if (this.history.length > 500) this.history.shift();
  }

  latest() { return this.history[this.history.length - 1] ?? null; }
  all() { return this.history; }
}

export const telemetryService = new TelemetryService();
