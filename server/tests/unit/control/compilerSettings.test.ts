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

describe("compiler kill switch", () => {
  beforeEach(() => { rows.length = 0; vi.resetModules(); });

  it("defaults to ENABLED when no row exists (kill switch, not a locked-down feature flag)", async () => {
    const { compilerSettings } = await import("../../../src/control/CompilerSettings");
    expect(await compilerSettings.isEnabled()).toBe(true);
  });

  it("setEnabled(false) disables it", async () => {
    const { compilerSettings } = await import("../../../src/control/CompilerSettings");
    await compilerSettings.setEnabled(false);
    expect(await compilerSettings.isEnabled()).toBe(false);
  });

  it("setEnabled(true) re-enables it after being disabled", async () => {
    const { compilerSettings } = await import("../../../src/control/CompilerSettings");
    await compilerSettings.setEnabled(false);
    await compilerSettings.setEnabled(true);
    expect(await compilerSettings.isEnabled()).toBe(true);
  });
});
