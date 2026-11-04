import { describe, it, expect, vi, beforeEach } from "vitest";

let rows: Array<{ id: string; commandType: string; scopedPersonId: string | null; reason: string | null; active: boolean }> = [];

vi.mock("../../../src/repositories/adminRestrictions.repository", () => ({
  adminRestrictionsRepository: {
    listActive: () => Promise.resolve(rows.filter((r) => r.active)),
    create: (input: { commandType: string; scopedPersonId: string | null; reason: string | null }) => {
      const row = { id: `r_${rows.length}`, active: true, ...input };
      rows.push(row);
      return Promise.resolve(row);
    },
    liftByCommandType: (commandType: string, scopedPersonId: string | null) => {
      rows = rows.map((r) => (r.commandType === commandType && r.scopedPersonId === scopedPersonId ? { ...r, active: false } : r));
      return Promise.resolve();
    },
  },
}));

describe("RestrictionService", () => {
  beforeEach(() => { rows = []; vi.resetModules(); });

  it("has no restriction by default", async () => {
    const { restrictionService } = await import("../../../src/restrictions/RestrictionService");
    expect(await restrictionService.check("WALK_FORWARD" as never)).toBeNull();
  });

  it("blocks a command after ban() until lift()", async () => {
    const { restrictionService } = await import("../../../src/restrictions/RestrictionService");
    await restrictionService.ban("WALK_FORWARD" as never, { createdByUserId: "admin-1", reason: "too close to the stairs" });

    const blocked = await restrictionService.check("WALK_FORWARD" as never);
    expect(blocked?.reason).toBe("too close to the stairs");

    await restrictionService.lift("WALK_FORWARD" as never, null);
    expect(await restrictionService.check("WALK_FORWARD" as never)).toBeNull();
  });

  it("scoping a ban to one person doesn't block the command for others", async () => {
    const { restrictionService } = await import("../../../src/restrictions/RestrictionService");
    await restrictionService.ban("TURN_LEFT" as never, { scopedPersonId: "person-a", createdByUserId: "admin-1" });

    expect(await restrictionService.check("TURN_LEFT" as never, "person-a")).not.toBeNull();
    expect(await restrictionService.check("TURN_LEFT" as never, "person-b")).toBeNull();
  });
});
