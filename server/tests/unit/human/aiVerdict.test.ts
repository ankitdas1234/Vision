import { describe, it, expect } from "vitest";
import { aiVerdict, type AiProbe } from "../../../simulation/autonomous/src/life";
const p = (o: Partial<AiProbe> = {}): AiProbe => ({ prompt: "q", ms: 800, ok: true, status: 200, reply: "A fine answer.", source: "ai", ...o });
const H = { llm: { configured: true, provider: "openai", model: "gpt" } };
describe("aiVerdict", () => {
  it("good when every probe is answered by the AI quickly", () => { const v = aiVerdict([p(), p({ ms: 1200 }), p()], H); expect(v.level).toBe("good"); expect(v.avgMs).toBe(933); expect(v.notes.join(" ")).toMatch(/openai/); });
  it("warns when replies are canned fallbacks, not AI", () => { const v = aiVerdict([p({ source: "fallback" }), p({ source: "direct" })], H); expect(v.level).toBe("warn"); expect(v.notes.join(" ")).toMatch(/not from an AI/); });
  it("warns when slow or partly failing", () => { expect(aiVerdict([p({ ms: 9000 }), p({ ms: 9000 })], H).level).toBe("warn"); expect(aiVerdict([p(), p({ ok: false, status: 500, reply: "" })], H).level).toBe("warn"); });
  it("bad with no answers, and explains 401 / 429 / no key / no server", () => {
    const v = aiVerdict([p({ ok: false, status: 401, reply: "" }), p({ ok: false, status: 429, reply: "" })], { llm: { configured: false, provider: "", model: "" } });
    expect(v.level).toBe("bad"); const n = v.notes.join(" "); expect(n).toMatch(/Sign in/); expect(n).toMatch(/Rate limit/); expect(n).toMatch(/No AI key/);
    expect(aiVerdict([], null).level).toBe("bad"); expect(aiVerdict([], null).notes.join(" ")).toMatch(/health check/);
  });
  it("flags empty replies", () => { expect(aiVerdict([p({ reply: "" }), p()], H).level).toBe("warn"); });
});
