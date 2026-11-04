import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

const results: any[][] = [];
const chain = () => ({ from: () => ({ where: async () => results.shift() ?? [] }) });
vi.mock("../../../src/database/client", () => ({ db: { select: () => chain(), insert: () => ({ values: async () => {} }) } }));
vi.mock("../../../src/config/env", () => ({ env: { JWT_SECRET: "test-secret-test-secret-test-secret" } }));

const token = (role: string) => jwt.sign({ sub: "u1", email: "a@b.c", role }, "test-secret-test-secret-test-secret", { expiresIn: 3600 });
const liveSession = [{ expiresAt: new Date(Date.now() + 60_000) }];

describe("sessionService.verify uses the CURRENT role from the database", () => {
  beforeEach(() => { results.length = 0; });

  it("a user promoted to ADMIN after logging in is an ADMIN straight away", async () => {
    const { sessionService } = await import("../../../src/auth/SessionService");
    results.push(liveSession, [{ role: "ADMIN", isActive: true }]);
    expect((await sessionService.verify(token("USER")))?.role).toBe("ADMIN");
  });

  it("a user demoted after logging in loses admin straight away", async () => {
    const { sessionService } = await import("../../../src/auth/SessionService");
    results.push(liveSession, [{ role: "USER", isActive: true }]);
    expect((await sessionService.verify(token("ADMIN")))?.role).toBe("USER");
  });

  it("a disabled or deleted user is refused", async () => {
    const { sessionService } = await import("../../../src/auth/SessionService");
    results.push(liveSession, [{ role: "ADMIN", isActive: false }]);
    expect(await sessionService.verify(token("ADMIN"))).toBeNull();
    results.push(liveSession, []);
    expect(await sessionService.verify(token("ADMIN"))).toBeNull();
  });
});
