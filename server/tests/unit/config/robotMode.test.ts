import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const KEYS = ["ROBOT_MODE", "MOCK_MODE"] as const;
const saved: Record<string, string | undefined> = {};

async function loadEnv(vars: Partial<Record<(typeof KEYS)[number], string>>) {
  vi.resetModules();
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, vars);
  return (await import("../../../src/config/env")).env;
}

describe("ROBOT_MODE switch", () => {
  beforeEach(() => { for (const k of KEYS) saved[k] = process.env[k]; });
  afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } vi.resetModules(); });

  it("defaults to simulation — never drives hardware unless told to", async () => {
    const env = await loadEnv({});
    expect(env.ROBOT_MODE).toBe("simulation");
    expect(env.MOCK_MODE).toBe(true);
  });

  it("ROBOT_MODE=hardware connects to the real robot", async () => {
    const env = await loadEnv({ ROBOT_MODE: "hardware" });
    expect(env.ROBOT_MODE).toBe("hardware");
    expect(env.MOCK_MODE).toBe(false);
  });

  it("ROBOT_MODE=simulation runs the virtual robot", async () => {
    const env = await loadEnv({ ROBOT_MODE: "simulation" });
    expect(env.ROBOT_MODE).toBe("simulation");
    expect(env.MOCK_MODE).toBe(true);
  });

  it("legacy MOCK_MODE=false still means hardware (old .env files keep working)", async () => {
    expect((await loadEnv({ MOCK_MODE: "false" })).ROBOT_MODE).toBe("hardware");
    expect((await loadEnv({ MOCK_MODE: "true" })).ROBOT_MODE).toBe("simulation");
  });

  it("ROBOT_MODE wins over the legacy MOCK_MODE", async () => {
    expect((await loadEnv({ ROBOT_MODE: "hardware", MOCK_MODE: "true" })).ROBOT_MODE).toBe("hardware");
  });
});
