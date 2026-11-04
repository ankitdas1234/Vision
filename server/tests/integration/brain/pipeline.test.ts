import { describe, it, expect } from "vitest";
import { BrainOrchestrator } from "../../../src/brain/BrainOrchestrator";

describe("brain pipeline (mock mode)", () => {
  it("TEST 14: unknown object with insufficient similarity -> completes cycle without throwing", async () => {
    const brain = new BrainOrchestrator();
    const result = await brain.observeAndReact(Buffer.from("mock"), "vision-001");
    expect(result.observationId).toBeTruthy();
    expect(result.decision).toBeTruthy();
  });
});
