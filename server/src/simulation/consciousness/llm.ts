/**
 * Language cortex for the Autonomous simulation view (ported from the `consciousness` sandbox).
 *
 * Provider-agnostic LLM call with optional image input, plain fetch, no SDKs. By default it reuses
 * Vision's own OpenRouter settings (OPENROUTER_API_KEY / OPENROUTER_MODEL / OPENROUTER_VISION_MODEL),
 * so there is nothing new to configure. Optional overrides, all read from process.env:
 *
 *   SIM_LLM_PROVIDER   anthropic | openai | openrouter | ollama | none   (none = local mind only)
 *   SIM_LLM_MODEL      override the model
 *   SIM_LLM_BASE_URL   e.g. http://localhost:11434/v1 for Ollama / LM Studio
 *   ANTHROPIC_API_KEY / OPENAI_API_KEY   only used when that provider is selected
 *
 * The LLM only phrases speech. It never chooses actions — the simulated mind does.
 * This file is simulation-only: it is reached solely through /api/simulation/consciousness/*.
 */

export type Provider = "anthropic" | "openai" | "openrouter" | "ollama" | "router" | "none";
export interface LLMConfig { provider: Provider; model: string; visionModel?: string; apiKey?: string; baseUrl: string; vision: boolean }

interface VisionEnv { OPENROUTER_API_KEY?: string; OPENROUTER_MODEL?: string; OPENROUTER_VISION_MODEL?: string }

export function loadLLMConfig(visionEnv: VisionEnv, proc: NodeJS.ProcessEnv = process.env): LLMConfig {
  const forced = (proc.SIM_LLM_PROVIDER ?? "").toLowerCase();
  const provider = (["anthropic", "openai", "openrouter", "ollama", "router", "none"].includes(forced) ? forced
    : visionEnv.OPENROUTER_API_KEY ? "openrouter" : "none") as Provider;
  const defaults: Record<Provider, { model: string; baseUrl: string; key?: string }> = {
    anthropic: { model: "claude-sonnet-5-5", baseUrl: "https://api.anthropic.com", key: proc.ANTHROPIC_API_KEY },
    openai: { model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1", key: proc.OPENAI_API_KEY },
    openrouter: { model: visionEnv.OPENROUTER_MODEL || "openrouter/auto", baseUrl: "https://openrouter.ai/api/v1", key: visionEnv.OPENROUTER_API_KEY },
    ollama: { model: "llava", baseUrl: "http://localhost:11434/v1" },
    router: { model: "multi-model router", baseUrl: "", key: "router" },
    none: { model: "", baseUrl: "" },
  };
  const d = defaults[provider];
  return {
    provider,
    model: proc.SIM_LLM_MODEL || d.model,
    visionModel: provider === "openrouter" ? visionEnv.OPENROUTER_VISION_MODEL || undefined : undefined,
    apiKey: d.key,
    baseUrl: proc.SIM_LLM_BASE_URL || d.baseUrl,
    vision: provider === "openrouter" ? Boolean(visionEnv.OPENROUTER_VISION_MODEL) : (proc.SIM_LLM_VISION ?? "true") !== "false",
  };
}

export const isConfigured = (c: LLMConfig) => c.provider !== "none" && (c.provider === "ollama" || !!c.apiKey);

export interface CompleteInput { system: string; user: string; image?: string | null; maxTokens?: number }

function parseDataUrl(url: string): { mediaType: string; data: string } | null {
  const m = url.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  return m ? { mediaType: m[1], data: m[2] } : null;
}

export async function complete(cfg: LLMConfig, input: CompleteInput): Promise<string> {
  const img = cfg.vision && input.image ? parseDataUrl(input.image) : null;

  // Multi-model router (src/ai/router): the first available model answers, others take over silently.
  if (cfg.provider === "router") {
    const { aiRouter } = await import("../../ai/router");
    const prompt = `${input.system}\n\n${input.user}`;
    const r = img ? await aiRouter.completeImage(prompt, { base64: img.data, mimeType: img.mediaType }) : await aiRouter.complete(prompt);
    return r.text;
  }
  const signal = AbortSignal.timeout(25000);
  const maxTokens = input.maxTokens ?? 500;
  const model = img && cfg.visionModel ? cfg.visionModel : cfg.model;

  if (cfg.provider === "anthropic") {
    const content: unknown[] = [];
    if (img) content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } });
    content.push({ type: "text", text: input.user });
    const res = await fetch(`${cfg.baseUrl}/v1/messages`, {
      method: "POST", signal,
      headers: { "content-type": "application/json", "x-api-key": cfg.apiKey ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: maxTokens, system: input.system, messages: [{ role: "user", content }] }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { content?: { type: string; text?: string }[] };
    return (j.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  }

  // OpenAI-compatible (OpenAI, OpenRouter, Ollama, LM Studio, vLLM...)
  const userContent: unknown[] = [{ type: "text", text: input.user }];
  if (img) userContent.push({ type: "image_url", image_url: { url: `data:${img.mediaType};base64,${img.data}` } });
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`;
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST", signal, headers,
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0.9, messages: [{ role: "system", content: input.system }, { role: "user", content: userContent }] }),
  });
  if (!res.ok) throw new Error(`${cfg.provider} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return j.choices?.[0]?.message?.content ?? "";
}
