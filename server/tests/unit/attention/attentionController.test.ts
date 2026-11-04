import { describe, it, expect } from "vitest";
import { AttentionController } from "../../../src/attention/AttentionController";

function input(overrides: Partial<Parameters<AttentionController["update"]>[0]> = {}) {
  return {
    presenceEvent: "NONE" as const,
    frameHadInterest: false,
    personDetected: false,
    sensorsDisagree: false,
    ...overrides,
  };
}

describe("AttentionController", () => {
  it("starts IDLE", () => {
    const controller = new AttentionController();
    expect(controller.getState()).toBe("IDLE");
  });

  it("becomes FOCUSED and shortens the interval when a person is confirmed", () => {
    const controller = new AttentionController();
    const snapshot = controller.update(input({ personDetected: true }));
    expect(snapshot.state).toBe("FOCUSED");
    expect(snapshot.recommendedIntervalMs).toBeLessThan(1000);
  });

  it("becomes ALERTED when the ultrasonic sense reports something near", () => {
    const controller = new AttentionController();
    const snapshot = controller.update(input({ presenceEvent: "ENTERED_NEAR_FIELD" }));
    expect(snapshot.state).toBe("ALERTED");
  });

  it("treats sensor disagreement as attention-worthy even with no visible person", () => {
    const controller = new AttentionController();
    const snapshot = controller.update(input({ sensorsDisagree: true }));
    expect(snapshot.state).toBe("FOCUSED");
  });

  it("habituates after several consecutive empty looks and slows down further than IDLE", () => {
    const controller = new AttentionController();
    let snapshot = controller.update(input());
    for (let i = 0; i < 5; i++) snapshot = controller.update(input());
    expect(snapshot.state).toBe("HABITUATED");
    expect(snapshot.recommendedIntervalMs).toBeGreaterThan(2000);
  });

  it("returns to attentiveness immediately once something interesting reappears", () => {
    const controller = new AttentionController();
    for (let i = 0; i < 6; i++) controller.update(input());
    expect(controller.getState()).toBe("HABITUATED");
    const snapshot = controller.update(input({ personDetected: true }));
    expect(snapshot.state).toBe("FOCUSED");
  });
});
