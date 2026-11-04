import { describe, it, expect, vi } from "vitest";
import { proposeSongQuestion } from "../../../src/music/SongQuestionProposer";
import { openRouterClient } from "../../../src/ai/OpenRouterClient";

const baseCtx = { requestedText: "some upbeat song", questionIndex: 0 };

describe("proposeSongQuestion", () => {
  it("falls back to a curated question when AI isn't configured (no OPENROUTER_API_KEY in test env)", async () => {
    const result = await proposeSongQuestion(baseCtx);
    expect(result.question.length).toBeGreaterThan(0);
    expect(result.fromModel).toBe(false);
  });

  it("cycles through different fallback questions by questionIndex", async () => {
    const q0 = await proposeSongQuestion({ ...baseCtx, questionIndex: 0 });
    const q1 = await proposeSongQuestion({ ...baseCtx, questionIndex: 1 });
    expect(q0.question).not.toBe(q1.question);
  });

  it("never throws even if the underlying call rejects", async () => {
    const spy = vi.spyOn(openRouterClient, "complete").mockRejectedValueOnce(new Error("network down"));
    const result = await proposeSongQuestion(baseCtx);
    expect(result.fromModel).toBe(false);
    spy.mockRestore();
  });

  it("accepts a well-formed, on-topic model response", async () => {
    const spy = vi.spyOn(openRouterClient, "complete").mockResolvedValueOnce({
      text: "What made you think of this song today?",
      confidence: 0.6,
      model: "test",
      latencyMs: 10,
    });
    const result = await proposeSongQuestion(baseCtx);
    expect(result.question).toBe("What made you think of this song today?");
    expect(result.fromModel).toBe(true);
    spy.mockRestore();
  });

  it("rejects a response that mentions lyrics and falls back instead", async () => {
    const spy = vi.spyOn(openRouterClient, "complete").mockResolvedValueOnce({
      text: "What's your favorite lyric from this song?",
      confidence: 0.6,
      model: "test",
      latencyMs: 10,
    });
    const result = await proposeSongQuestion(baseCtx);
    expect(result.fromModel).toBe(false);
    spy.mockRestore();
  });

  it("rejects a response containing a long quoted passage and falls back instead", async () => {
    const spy = vi.spyOn(openRouterClient, "complete").mockResolvedValueOnce({
      text: 'Do you like the part that goes "this is a suspiciously long quoted passage of text that looks copied"?',
      confidence: 0.6,
      model: "test",
      latencyMs: 10,
    });
    const result = await proposeSongQuestion(baseCtx);
    expect(result.fromModel).toBe(false);
    spy.mockRestore();
  });

  it("rejects an excessively long response and falls back instead", async () => {
    const spy = vi.spyOn(openRouterClient, "complete").mockResolvedValueOnce({
      text: "Why do you love this song? ".repeat(30),
      confidence: 0.6,
      model: "test",
      latencyMs: 10,
    });
    const result = await proposeSongQuestion(baseCtx);
    expect(result.fromModel).toBe(false);
    spy.mockRestore();
  });

  it("strips surrounding quote marks from an otherwise valid response", async () => {
    const spy = vi.spyOn(openRouterClient, "complete").mockResolvedValueOnce({
      text: '"Who is your favorite artist?"',
      confidence: 0.6,
      model: "test",
      latencyMs: 10,
    });
    const result = await proposeSongQuestion(baseCtx);
    expect(result.question).toBe("Who is your favorite artist?");
    expect(result.fromModel).toBe(true);
    spy.mockRestore();
  });
});
