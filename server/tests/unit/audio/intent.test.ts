import { describe, it, expect } from "vitest";
import { understandIntent } from "../../../src/audio/IntentEngine";

describe("audio intent engine", () => {
  it("classifies a movement phrase", () => {
    expect(understandIntent("Vision, move forward please").type).toBe("MOVEMENT_COMMAND");
  });

  it("classifies a greeting", () => {
    expect(understandIntent("Hello Vision").type).toBe("GREETING");
  });

  it("classifies a question", () => {
    expect(understandIntent("What is that object?").type).toBe("QUESTION");
  });

  it("classifies an admin veto phrase", () => {
    expect(understandIntent("Vision, don't do that").type).toBe("ADMIN_VETO");
    expect(understandIntent("stop doing that").type).toBe("ADMIN_VETO");
  });

  it("classifies an admin lift-restriction phrase", () => {
    expect(understandIntent("okay, you can do that now").type).toBe("ADMIN_LIFT_RESTRICTION");
  });

  it("returns UNKNOWN for empty transcript (e.g. silence/noise)", () => {
    expect(understandIntent("").type).toBe("UNKNOWN");
  });
});
