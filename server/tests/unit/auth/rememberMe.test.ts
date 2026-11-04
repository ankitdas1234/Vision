import { describe, it, expect, vi, beforeEach } from "vitest";

const inserted: any[] = [];
vi.mock("../../../src/database/client", () => ({
  db: { insert: () => ({ values: async (v: any) => { inserted.push(v); } }) },
}));
vi.mock("../../../src/config/env", () => ({ env: { JWT_SECRET: "test-secret-test-secret-test-secret" } }));

const DAY = 24 * 60 * 60 * 1000;
const user = { id: "u1", email: "a@b.c", role: "USER" as const };

describe("sessionService.issue — Remember me lifetimes", () => {
  beforeEach(() => { inserted.length = 0; });

  it("keeps the 7 day default when no ttl is given", async () => {
    const { sessionService } = await import("../../../src/auth/SessionService");
    const s = await sessionService.issue(user, {});
    expect(Math.round((s.expiresAt.getTime() - Date.now()) / DAY)).toBe(7);
  });

  it("remembered sessions last 30 days, others 1 day", async () => {
    const { sessionService, REMEMBER_TTL_MS, SHORT_TTL_MS } = await import("../../../src/auth/SessionService");
    const long = await sessionService.issue(user, { ttlMs: REMEMBER_TTL_MS });
    const short = await sessionService.issue(user, { ttlMs: SHORT_TTL_MS });
    expect(Math.round((long.expiresAt.getTime() - Date.now()) / DAY)).toBe(30);
    expect(Math.round((short.expiresAt.getTime() - Date.now()) / DAY)).toBe(1);
    expect(inserted[0].expiresAt.getTime()).toBe(long.expiresAt.getTime()); // DB record matches the JWT
  });
});

describe("login route cookie", () => {
  it("sets an expiry only when remember is true (otherwise a browser-session cookie)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../../src/routes/auth.routes.ts", import.meta.url), "utf-8");
    expect(src).toMatch(/remember: z\.boolean\(\)\.optional\(\)/);
    expect(src).toMatch(/req\.body\.remember \? \{ \.\.\.cookieOptions, expires: session\.expiresAt \} : cookieOptions/);
  });
});
