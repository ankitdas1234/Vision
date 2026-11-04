import { describe, it, expect } from "vitest";
import { sanitize } from "../../../src/simulation/consciousness/cortex";
import { loadLLMConfig, isConfigured } from "../../../src/simulation/consciousness/llm";

describe("language cortex: the model proposes, the sanitiser decides", () => {
  const targets = new Set(["home", "ball"]);

  it("turns any non-whitelisted action into idle", () => {
    expect(sanitize({ action: { type: "launch_missiles" } }, targets).action.type).toBe("idle");
    expect(sanitize({ action: { type: "dance" } }, targets).action.type).toBe("dance");
  });

  it("only allows go_to for real targets", () => {
    expect(sanitize({ action: { type: "go_to", target: "ball" } }, targets).action).toMatchObject({ type: "go_to", target: "ball" });
    expect(sanitize({ action: { type: "go_to", target: "the moon" } }, targets).action.type).toBe("idle");
  });

  it("clamps numbers and strips control characters / angle brackets from speech", () => {
    const d = sanitize({ say: "hi <script>\u0000\u0007 there", thought: "x", action: { type: "turn", angle: 9999, duration_ms: 5 }, emotion: { valence: 5, arousal: -5 }, next_think_in_s: 1 }, targets);
    expect(d.say).toBe("hi  script    there"); // each unsafe character becomes a space
    expect(d.say).not.toMatch(/[<>]/);
    expect(d.action.angle).toBe(180);
    expect(d.action.duration_ms).toBe(1500);
    expect(d.emotion).toEqual({ valence: 0.3, arousal: -0.3 });
    expect(d.next_think_in_s).toBe(3);
  });
});

describe("language cortex config reuses Vision's OpenRouter settings", () => {
  it("is off with no key", () => expect(isConfigured(loadLLMConfig({}, {}))).toBe(false));

  it("picks OpenRouter and its model/vision model from Vision's env", () => {
    const cfg = loadLLMConfig({ OPENROUTER_API_KEY: "k", OPENROUTER_MODEL: "m", OPENROUTER_VISION_MODEL: "v" }, {});
    expect(cfg).toMatchObject({ provider: "openrouter", model: "m", visionModel: "v", vision: true });
    expect(isConfigured(cfg)).toBe(true);
  });

  it("SIM_LLM_PROVIDER=none keeps the local mind only", () => {
    expect(isConfigured(loadLLMConfig({ OPENROUTER_API_KEY: "k" }, { SIM_LLM_PROVIDER: "none" }))).toBe(false);
  });
});
