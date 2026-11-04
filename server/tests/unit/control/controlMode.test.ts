import { describe, it, expect, vi, beforeEach } from "vitest";

const rows: { key: string; value: unknown }[] = [];

vi.mock("../../../src/database/client", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve(rows) }) }),
    insert: () => ({
      values: (v: { key: string; value: unknown }) => ({
        onConflictDoUpdate: () => { rows.splice(0, rows.length, v); return Promise.resolve(); },
      }),
    }),
  },
}));

describe("control mode", () => {
  beforeEach(() => { rows.length = 0; vi.resetModules(); });

  it("defaults to AUTONOMOUS when no row exists", async () => {
    const { controlMode } = await import("../../../src/control/ControlMode");
    expect(await controlMode.isManualModeEnabled()).toBe(false);
    expect(await controlMode.mode()).toBe("AUTONOMOUS");
  });

  it("setManualModeEnabled(true) switches to MANUAL", async () => {
    const { controlMode } = await import("../../../src/control/ControlMode");
    await controlMode.setManualModeEnabled(true);
    expect(await controlMode.isManualModeEnabled()).toBe(true);
    expect(await controlMode.mode()).toBe("MANUAL");
  });
});
