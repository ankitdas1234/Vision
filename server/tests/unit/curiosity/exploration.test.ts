import { describe, it, expect } from "vitest";
import { shouldEnterExploration, IDLE_EXPLORATION_THRESHOLD_MS } from "../../../src/curiosity/ExplorationTrigger";

describe("exploration trigger (10-minute idle rule)", () => {
  const base = { activeConversation: false, emergencyActive: false, hardwareHealthy: true, environmentSafe: true, conflictingCriticalTask: false };

  it("does not explore before the idle threshold", () => {
    const now = Date.now();
    expect(shouldEnterExploration({ ...base, lastHumanInteractionAt: now - 1000 }, now)).toBe(false);
  });

  it("explores after more than 10 minutes idle", () => {
    const now = Date.now();
    expect(shouldEnterExploration({ ...base, lastHumanInteractionAt: now - IDLE_EXPLORATION_THRESHOLD_MS - 1000 }, now)).toBe(true);
  });

  it("never explores during an emergency, even if idle", () => {
    const now = Date.now();
    expect(shouldEnterExploration({ ...base, emergencyActive: true, lastHumanInteractionAt: now - IDLE_EXPLORATION_THRESHOLD_MS - 1000 }, now)).toBe(false);
  });

  it("never explores with an active conversation", () => {
    const now = Date.now();
    expect(shouldEnterExploration({ ...base, activeConversation: true, lastHumanInteractionAt: now - IDLE_EXPLORATION_THRESHOLD_MS - 1000 }, now)).toBe(false);
  });
});
