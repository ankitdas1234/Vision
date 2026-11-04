import { describe, it, expect, vi, afterEach } from "vitest";

async function loadWith(vars: Record<string, string | undefined>) {
  vi.resetModules();
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) { saved[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  const env = (await import("../../../src/config/env")).env;
  for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  return env;
}
afterEach(() => vi.resetModules());

describe("COOKIE_SAMESITE (dashboard and API on different sites need 'none')", () => {
  it("defaults to lax", async () => expect((await loadWith({ COOKIE_SAMESITE: undefined })).COOKIE_SAMESITE).toBe("lax"));
  it("accepts none and strict", async () => {
    expect((await loadWith({ COOKIE_SAMESITE: "none" })).COOKIE_SAMESITE).toBe("none");
    expect((await loadWith({ COOKIE_SAMESITE: "strict" })).COOKIE_SAMESITE).toBe("strict");
  });
  it("auth routes force Secure on whenever SameSite=None (browsers reject None without Secure)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../../src/routes/auth.routes.ts", import.meta.url), "utf-8");
    expect(src).toMatch(/secure:\s*isProd \|\| env\.COOKIE_SAMESITE === "none"/);
    expect(src).toMatch(/sameSite:\s*env\.COOKIE_SAMESITE/);
  });
});
