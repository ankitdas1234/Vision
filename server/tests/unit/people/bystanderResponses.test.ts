import { describe, it, expect, vi, afterEach } from "vitest";
import { interpretBystanderReplyKeywords, interpretBystanderReply } from "../../../src/people/BystanderResponses";

describe("interpretBystanderReplyKeywords (deterministic fallback)", () => {
  it("recognizes a location hint", () => {
    const result = interpretBystanderReplyKeywords("I think they went into the kitchen");
    expect(result.type).toBe("LOCATION_HINT");
    expect(result.locationHint).toBe("kitchen");
  });

  it("recognizes a negative reply", () => {
    expect(interpretBystanderReplyKeywords("No, haven't seen them").type).toBe("HAVE_NOT_SEEN");
    expect(interpretBystanderReplyKeywords("sorry, no idea").type).toBe("HAVE_NOT_SEEN");
  });

  it("recognizes a positive reply with no location", () => {
    expect(interpretBystanderReplyKeywords("Yeah I saw him").type).toBe("SAW_THEM");
  });

  it("falls back to unclear for anything else", () => {
    expect(interpretBystanderReplyKeywords("What time is it?").type).toBe("UNCLEAR");
  });

  it("always returns a spoken reply, even when unclear", () => {
    expect(interpretBystanderReplyKeywords("blah blah").reply.length).toBeGreaterThan(0);
  });

  it("prioritizes a location hint over a generic positive/negative match", () => {
    const result = interpretBystanderReplyKeywords("yes, in the garage");
    expect(result.type).toBe("LOCATION_HINT");
    expect(result.locationHint).toBe("garage");
  });
});

describe("interpretBystanderReply (AI-backed, with deterministic fallback)", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../../../src/config/ai");
    vi.doUnmock("../../../src/ai/OpenRouterClient");
  });

  it("falls back to keyword matching when no AI key is configured", async () => {
    vi.resetModules();
    vi.doMock("../../../src/config/ai", () => ({ aiConfig: { enabled: false } }));
    const { interpretBystanderReply: FreshInterpret } = await import("../../../src/people/BystanderResponses");
    const result = await FreshInterpret("I think I saw them in the kitchen", "Sam");
    expect(result.type).toBe("LOCATION_HINT");
    expect(result.locationHint).toBe("kitchen");
  });

  it("uses the AI model's structured response when configured and parseable", async () => {
    vi.resetModules();
    vi.doMock("../../../src/config/ai", () => ({ aiConfig: { enabled: true } }));
    vi.doMock("../../../src/ai/OpenRouterClient", () => ({
      openRouterClient: {
        complete: vi.fn(async (req: { prompt: string }) => {
          expect(req.prompt).toContain("Sam");
          return {
            text: JSON.stringify({ type: "LOCATION_HINT", locationHint: "out by the mailbox", reply: "Thanks, I'll check there." }),
            confidence: 0.6,
            model: "test",
            latencyMs: 1,
          };
        }),
      },
    }));

    const { interpretBystanderReply: FreshInterpret } = await import("../../../src/people/BystanderResponses");
    const result = await FreshInterpret("I saw them out by the mailbox a minute ago", "Sam");
    expect(result.type).toBe("LOCATION_HINT");
    expect(result.locationHint).toBe("out by the mailbox");
    expect(result.reply).toBe("Thanks, I'll check there.");
  });

  it("falls back to keywords when the AI response is unparseable JSON", async () => {
    vi.resetModules();
    vi.doMock("../../../src/config/ai", () => ({ aiConfig: { enabled: true } }));
    vi.doMock("../../../src/ai/OpenRouterClient", () => ({
      openRouterClient: { complete: vi.fn(async () => ({ text: "not json at all", confidence: 0.6, model: "test", latencyMs: 1 })) },
    }));

    const { interpretBystanderReply: FreshInterpret } = await import("../../../src/people/BystanderResponses");
    const result = await FreshInterpret("No, haven't seen them", "Sam");
    expect(result.type).toBe("HAVE_NOT_SEEN");
  });

  it("falls back to keywords when the AI call throws", async () => {
    vi.resetModules();
    vi.doMock("../../../src/config/ai", () => ({ aiConfig: { enabled: true } }));
    vi.doMock("../../../src/ai/OpenRouterClient", () => ({
      openRouterClient: { complete: vi.fn(async () => { throw new Error("network error"); }) },
    }));

    const { interpretBystanderReply: FreshInterpret } = await import("../../../src/people/BystanderResponses");
    const result = await FreshInterpret("Yeah I saw him", "Sam");
    expect(result.type).toBe("SAW_THEM");
  });

  it("rejects a structurally invalid AI response (bad type enum) and falls back", async () => {
    vi.resetModules();
    vi.doMock("../../../src/config/ai", () => ({ aiConfig: { enabled: true } }));
    vi.doMock("../../../src/ai/OpenRouterClient", () => ({
      openRouterClient: { complete: vi.fn(async () => ({ text: JSON.stringify({ type: "MAYBE", reply: "hmm" }), confidence: 0.6, model: "test", latencyMs: 1 })) },
    }));

    const { interpretBystanderReply: FreshInterpret } = await import("../../../src/people/BystanderResponses");
    const result = await FreshInterpret("blah blah", "Sam");
    expect(result.type).toBe("UNCLEAR");
  });
});
