import { describe, it, expect } from "vitest";
import { judgePersonInteraction } from "../../../src/mental/judgement";

describe("behavior profiles", () => {
  it("UNKNOWN category never resolves to ADMIN-tier trust", () => {
    const profile = judgePersonInteraction("UNKNOWN");
    expect(profile.traits).toContain("cautious");
  });
});
