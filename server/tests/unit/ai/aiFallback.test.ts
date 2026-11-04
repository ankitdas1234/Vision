import { describe, it, expect, vi } from "vitest";
const complete = vi.fn();
vi.mock("../../../src/ai/OpenRouterClient", () => ({ openRouterClient: { complete: (...a: unknown[]) => complete(...a) } }));
import { aiFallback } from "../../../src/ai/aiFallback";

describe("aiFallback", () => {
  it("an answer is a success", async () => {
    complete.mockResolvedValue({ text: "A banana is a fruit", confidence: 0.6, model: "m", latencyMs: 1 });
    expect(await aiFallback("banana")).toMatchObject({ success: true, text: "A banana is a fruit" });
  });
  it("no AI configured (empty text) is a miss, not a fake answer", async () => {
    complete.mockResolvedValue({ text: "  ", confidence: 0, model: "none", latencyMs: 0 });
    expect(await aiFallback("banana")).toMatchObject({ success: false, text: "" });
  });
  it("every model failing is a miss with the reason", async () => {
    complete.mockRejectedValue(new Error("all down"));
    expect(await aiFallback("banana")).toMatchObject({ success: false, error: "all down" });
  });
});
