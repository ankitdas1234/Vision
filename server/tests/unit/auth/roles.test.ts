import { describe, it, expect } from "vitest";
import { requireRole } from "../../../src/middleware/authorization";

function mockReq(role?: string) { return { user: role ? { id: "u1", email: "a@b.com", role } : undefined } as any; }
function mockRes() {
  const res: any = {};
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  return res;
}

describe("requireRole hierarchy", () => {
  it("USER cannot pass a TRUSTED gate", () => {
    const res = mockRes();
    let called = false;
    requireRole("TRUSTED")(mockReq("USER"), res, () => { called = true; });
    expect(called).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it("ADMIN passes a TRUSTED gate", () => {
    const res = mockRes();
    let called = false;
    requireRole("TRUSTED")(mockReq("ADMIN"), res, () => { called = true; });
    expect(called).toBe(true);
  });

  it("unauthenticated request is rejected", () => {
    const res = mockRes();
    let called = false;
    requireRole("USER")(mockReq(undefined), res, () => { called = true; });
    expect(called).toBe(false);
    expect(res.statusCode).toBe(403);
  });
});
