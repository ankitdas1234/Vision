import { describe, it, expect } from "vitest";
import { respond } from "../../../src/ai/router/router";
import { CooldownTracker } from "../../../src/ai/router/cooldowns";
import { ProviderError } from "../../../src/ai/router/errors";
import { buildProviders, buildRouting, keysFor, maskKey, DEFAULT_ROUTING } from "../../../src/ai/router";
import type { Provider } from "../../../src/ai/router/providers";

const fake = (id: string, behave: () => string): Provider & { calls: number } => {
  const p = { id, vision: true, calls: 0, async generate() { p.calls++; return behave(); } };
  return p;
};
const six = { GEMINI_API_KEYS: "k1,k2, k3\nk4;k5 k6", GEMINI_MODEL: "g" } as NodeJS.ProcessEnv;

describe("several API keys for one provider", () => {
  it("reads keys from the single variable, the list variable and numbered variables, without duplicates", () => {
    expect(keysFor("gemini", six)).toEqual(["k1", "k2", "k3", "k4", "k5", "k6"]);
    expect(keysFor("gemini", { GEMINI_API_KEY: "a", GEMINI_API_KEYS: "b,a", GEMINI_API_KEY_2: "c", GEMINI_API_KEY_3: "d" } as NodeJS.ProcessEnv)).toEqual(["a", "b", "c", "d"]);
    expect(keysFor("gemini", {} as NodeJS.ProcessEnv)).toEqual([]);
  });

  it("registers one slot per key and puts them next to each other in the chain, before other providers", () => {
    const env = { ...six, OPENAI_API_KEY: "o" } as NodeJS.ProcessEnv;
    expect([...buildProviders(env).keys()]).toEqual(["gemini", "gemini#2", "gemini#3", "gemini#4", "gemini#5", "gemini#6", "openai"]);
    const chain = buildRouting(DEFAULT_ROUTING, env).text.map((c) => c.provider).filter((p) => p.startsWith("gemini") || p === "openai");
    expect(chain).toEqual(["gemini", "gemini#2", "gemini#3", "gemini#4", "gemini#5", "gemini#6", "openai"]);
  });

  it("a single key behaves exactly as before (no extra slots)", () => {
    const env = { GEMINI_API_KEY: "only", GEMINI_MODEL: "g" } as NodeJS.ProcessEnv;
    expect([...buildProviders(env).keys()]).toEqual(["gemini"]);
    expect(buildRouting(DEFAULT_ROUTING, env).text.filter((c) => c.provider.startsWith("gemini"))).toEqual([{ provider: "gemini", model: "g" }]);
  });

  it("when key 1 is out of quota key 2 answers; when 1 and 2 are used up key 3 answers; they are not hammered again", async () => {
    const slots = [1, 2, 3].map((n) => fake(n === 1 ? "gemini" : `gemini#${n}`, () => { throw new ProviderError("quota", "quota"); }));
    slots[2] = fake("gemini#3", () => "from key 3");
    const providers = new Map<string, Provider>(slots.map((p) => [p.id, p]));
    const routing = { text: slots.map((p) => ({ provider: p.id, model: "g" })), image: [] };
    const cooldowns = new CooldownTracker();
    const r = await respond("text", "hi", undefined, { routing, providers, cooldowns });
    expect(r.text).toBe("from key 3");
    expect(r.provider).toBe("gemini#3");
    await respond("text", "again", undefined, { routing, providers, cooldowns });
    expect(slots[0].calls).toBe(1); expect(slots[1].calls).toBe(1); // cooling down
  });

  it("a wrong key only switches off its own slot", async () => {
    const bad = fake("gemini", () => { throw new ProviderError("bad key", "auth"); }), good = fake("gemini#2", () => "ok");
    const deps = { routing: { text: [{ provider: "gemini", model: "g" }, { provider: "gemini#2", model: "g" }], image: [] }, providers: new Map<string, Provider>([["gemini", bad], ["gemini#2", good]]), cooldowns: new CooldownTracker() };
    await respond("text", "1", undefined, deps); await respond("text", "2", undefined, deps);
    expect(bad.calls).toBe(1); expect(good.calls).toBe(2);
  });

  it("shows keys only as their last 4 characters", () => {
    expect(maskKey("AIzaSyABCDEFGHIJ1234")).toBe("…1234");
    expect(maskKey("short")).toBe("…");
  });
});

describe("the same works for Grok (xAI) and OpenRouter keys", () => {
  it("builds one slot per key and chains them in order", () => {
    const env = { XAI_API_KEYS: "x1,x2,x3", XAI_MODEL: "grok", OPENROUTER_API_KEY: "o1", OPENROUTER_API_KEY_2: "o2", OPENROUTER_MODEL: "free" } as NodeJS.ProcessEnv;
    expect([...buildProviders(env).keys()].sort()).toEqual(["openrouter", "openrouter#2", "xai", "xai#2", "xai#3"]);
    const chain = buildRouting(DEFAULT_ROUTING, env).text.map((c) => c.provider);
    expect(chain.filter((p) => p.startsWith("openrouter"))).toEqual(["openrouter", "openrouter#2"]);
    expect(chain.filter((p) => p.startsWith("xai"))).toEqual(["xai", "xai#2", "xai#3"]);
  });
});
