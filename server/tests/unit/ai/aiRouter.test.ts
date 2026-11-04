import { describe, it, expect } from "vitest";
import { respond, NoRouteError, type Routing } from "../../../src/ai/router/router";
import { CooldownTracker } from "../../../src/ai/router/cooldowns";
import { ProviderError } from "../../../src/ai/router/errors";
import { buildProviders, buildRouting, DEFAULT_ROUTING, AIRouter } from "../../../src/ai/router";
import type { Provider } from "../../../src/ai/router/providers";

const fake = (id: string, behave: () => string | never, vision = true): Provider & { calls: number } => {
  const p = { id, vision, calls: 0, async generate() { p.calls++; return behave(); } };
  return p;
};
const routing = (...c: [string, string][]): Routing => ({ text: c.map(([provider, model]) => ({ provider, model })), image: c.map(([provider, model]) => ({ provider, model })) });

describe("AI router - silent fallback", () => {
  it("uses the first model when it works", async () => {
    const a = fake("a", () => "from a"), b = fake("b", () => "from b");
    const r = await respond("text", "hi", undefined, { routing: routing(["a", "m1"], ["b", "m2"]), providers: new Map([["a", a], ["b", b]]), cooldowns: new CooldownTracker() });
    expect(r.text).toBe("from a"); expect(r.fallbacks).toEqual([]); expect(b.calls).toBe(0);
  });

  it("falls to the next model when the first is out of quota, and remembers it", async () => {
    const a = fake("a", () => { throw new ProviderError("quota", "quota"); }), b = fake("b", () => "from b");
    const cooldowns = new CooldownTracker();
    const deps = { routing: routing(["a", "m1"], ["b", "m2"]), providers: new Map<string, Provider>([["a", a], ["b", b]]), cooldowns };
    const r1 = await respond("text", "hi", undefined, deps);
    expect(r1.text).toBe("from b"); expect(r1.fallbacks[0]).toContain("a/m1");
    await respond("text", "again", undefined, deps);
    expect(a.calls).toBe(1); // cooling down: not hammered again
  });

  it("retries a brief blip once before switching models", async () => {
    let n = 0;
    const a = fake("a", () => { if (n++ === 0) throw new ProviderError("blip", "network", 1); return "ok after retry"; });
    const b = fake("b", () => "from b");
    const r = await respond("text", "hi", undefined, { routing: routing(["a", "m"], ["b", "m"]), providers: new Map<string, Provider>([["a", a], ["b", b]]), cooldowns: new CooldownTracker() });
    expect(r.text).toBe("ok after retry"); expect(b.calls).toBe(0);
  });

  it("skips providers with no key and text-only models for image requests", async () => {
    const t = fake("t", () => "text only", false), v = fake("v", () => "sees it");
    const r = await respond("image", "what", { base64: "AAAA", mimeType: "image/png" }, { routing: routing(["missing", "m"], ["t", "m"], ["v", "m"]), providers: new Map<string, Provider>([["t", t], ["v", v]]), cooldowns: new CooldownTracker() });
    expect(r.text).toBe("sees it"); expect(t.calls).toBe(0);
  });

  it("a bad key disables that model for the run, others still answer", async () => {
    const a = fake("a", () => { throw new ProviderError("bad key", "auth"); }), b = fake("b", () => "from b");
    const deps = { routing: routing(["a", "m"], ["b", "m"]), providers: new Map<string, Provider>([["a", a], ["b", b]]), cooldowns: new CooldownTracker() };
    await respond("text", "1", undefined, deps); await respond("text", "2", undefined, deps);
    expect(a.calls).toBe(1);
  });

  it("throws only when every model fails, listing why", async () => {
    const a = fake("a", () => { throw new ProviderError("x", "overloaded", 1); }), b = fake("b", () => { throw new ProviderError("y", "bad_request"); });
    await expect(respond("text", "hi", undefined, { routing: routing(["a", "m"], ["b", "m"]), providers: new Map<string, Provider>([["a", a], ["b", b]]), cooldowns: new CooldownTracker() })).rejects.toThrow(/Every AI model/);
  });

  it("reports NoRouteError when nothing is configured", async () => {
    await expect(respond("text", "hi", undefined, { routing: routing(["a", "m"]), providers: new Map(), cooldowns: new CooldownTracker() })).rejects.toBeInstanceOf(NoRouteError);
  });
});

describe("AI router - configuration", () => {
  it("with only OPENROUTER_API_KEY it behaves like the old single client", () => {
    const env = { OPENROUTER_API_KEY: "k", OPENROUTER_MODEL: "openrouter/auto", OPENROUTER_VISION_MODEL: "x/vision" } as NodeJS.ProcessEnv;
    const r = new AIRouter();
    r.configure(buildProviders(env), buildRouting(DEFAULT_ROUTING, env));
    expect(r.enabled).toBe(true); expect(r.visionEnabled).toBe(true);
    expect(r.status().routes.text).toEqual(["openrouter/openrouter/auto"]);
  });

  it("no keys means disabled; vision needs a vision model", () => {
    const none = new AIRouter(); none.configure(buildProviders({}), buildRouting(DEFAULT_ROUTING, {}));
    expect(none.enabled).toBe(false);
    const env = { OPENROUTER_API_KEY: "k", OPENROUTER_MODEL: "m" } as NodeJS.ProcessEnv;
    const r = new AIRouter(); r.configure(buildProviders(env), buildRouting(DEFAULT_ROUTING, env));
    expect(r.enabled).toBe(true); expect(r.visionEnabled).toBe(false);
  });

  it("several keys give an ordered fallback chain", () => {
    const env = { OPENROUTER_API_KEY: "a", OPENROUTER_MODEL: "free", GEMINI_API_KEY: "g", OPENAI_API_KEY: "o" } as NodeJS.ProcessEnv;
    const r = new AIRouter(); r.configure(buildProviders(env), buildRouting(DEFAULT_ROUTING, env));
    expect(r.status().routes.text).toEqual(["openrouter/free", "gemini/gemini-2.0-flash", "openai/gpt-4o-mini"]);
  });
});
