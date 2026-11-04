import { describe, it, expect, vi } from "vitest";
import { proposeGoal, EXPLORATION_GOALS } from "../../../src/decisions/GoalProposer";
import { openRouterClient } from "../../../src/ai/OpenRouterClient";

const baseCtx = { recentMemorySummary: "", goalsProposedThisSession: 0, hasUnknownObjectsNearby: false };

describe("proposeGoal", () => {
  it("falls back to a safe default when AI isn't configured (no OPENROUTER_API_KEY in test env)", async () => {
    const result = await proposeGoal(baseCtx);
    expect(EXPLORATION_GOALS).toContain(result.goal);
    expect(result.fromModel).toBe(false);
  });

  it("never throws even if the underlying call rejects", async () => {
    const spy = vi.spyOn(openRouterClient, "complete").mockRejectedValueOnce(new Error("network down"));
    const result = await proposeGoal(baseCtx);
    expect(EXPLORATION_GOALS).toContain(result.goal);
    expect(result.fromModel).toBe(false);
    spy.mockRestore();
  });

  it("accepts a well-formed model response", async () => {
    const spy = vi.spyOn(openRouterClient, "complete").mockResolvedValueOnce({
      text: '{"goal": "SCAN_AREA", "reason": "Nothing unusual, just look around."}',
      confidence: 0.6,
      model: "test",
      latencyMs: 10,
    });
    const result = await proposeGoal(baseCtx);
    expect(result.goal).toBe("SCAN_AREA");
    expect(result.fromModel).toBe(true);
    spy.mockRestore();
  });

  it("strips a markdown code fence around otherwise-valid JSON", async () => {
    const spy = vi.spyOn(openRouterClient, "complete").mockResolvedValueOnce({
      text: '```json\n{"goal": "WANDER", "reason": "explore"}\n```',
      confidence: 0.6,
      model: "test",
      latencyMs: 10,
    });
    const result = await proposeGoal(baseCtx);
    expect(result.goal).toBe("WANDER");
    spy.mockRestore();
  });

  it("rejects a goal outside the fixed vocabulary and falls back instead", async () => {
    const spy = vi.spyOn(openRouterClient, "complete").mockResolvedValueOnce({
      text: '{"goal": "CLIMB_THE_STAIRS", "reason": "made up"}',
      confidence: 0.6,
      model: "test",
      latencyMs: 10,
    });
    const result = await proposeGoal(baseCtx);
    expect(EXPLORATION_GOALS).toContain(result.goal);
    expect(result.fromModel).toBe(false);
    spy.mockRestore();
  });

  it("rejects unparseable JSON and falls back instead", async () => {
    const spy = vi.spyOn(openRouterClient, "complete").mockResolvedValueOnce({
      text: "sure, let's go explore!",
      confidence: 0.6,
      model: "test",
      latencyMs: 10,
    });
    const result = await proposeGoal(baseCtx);
    expect(result.fromModel).toBe(false);
    spy.mockRestore();
  });

  it("truncates an excessively long reason rather than storing it unbounded", async () => {
    const spy = vi.spyOn(openRouterClient, "complete").mockResolvedValueOnce({
      text: JSON.stringify({ goal: "WANDER", reason: "x".repeat(5000) }),
      confidence: 0.6,
      model: "test",
      latencyMs: 10,
    });
    const result = await proposeGoal(baseCtx);
    expect(result.reason.length).toBeLessThanOrEqual(300);
    spy.mockRestore();
  });
});
