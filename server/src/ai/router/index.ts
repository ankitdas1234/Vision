import fs from "node:fs";
import path from "node:path";
import { env } from "../../config/env";
import { logger } from "../../logging/Logger";
import { CooldownTracker, type Candidate } from "./cooldowns";
import { AnthropicProvider, GeminiProvider, OpenAICompatibleProvider, type ImageInput, type Provider } from "./providers";
import { respond, type Kind, type RouteResult, type Routing } from "./router";

/**
 * Multi-model AI router (ported from the ai-response project).
 *
 * Text and image requests each have an ordered list of models (server/ai-routing.json, or AI_ROUTING_FILE).
 * Providers without an API key are skipped; if a model is out of quota, rate limited or down, the next
 * model answers and nobody notices. Backwards compatible: with only OPENROUTER_API_KEY set it behaves
 * exactly like the old single OpenRouter client.
 *
 * Keys: OPENROUTER_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, XAI_API_KEY, ANTHROPIC_API_KEY,
 *       and the generic LLM_API_KEY / LLM_API_URL / LLM_MODEL for any OpenAI-compatible server.
 * Several keys per provider (for example one Gemini key per admin): see keysFor() below. Each key is its own slot, with its own
 * cool-down, so an exhausted key is skipped and the next key takes over.
 */

/** Built-in routes, used when no routing file exists. ${NAME:-default} is expanded from the environment. */
export const DEFAULT_ROUTING = {
  text: [
    { provider: "openrouter", model: "${OPENROUTER_MODEL}" },
    { provider: "llm", model: "${LLM_MODEL}" },
    { provider: "gemini", model: "${GEMINI_MODEL:-gemini-2.0-flash}" },
    { provider: "openai", model: "${OPENAI_MODEL:-gpt-4o-mini}" },
    { provider: "xai", model: "${XAI_MODEL:-grok-2-latest}" },
    { provider: "anthropic", model: "${ANTHROPIC_MODEL:-claude-3-5-haiku-latest}" },
  ],
  image: [
    { provider: "openrouter", model: "${OPENROUTER_VISION_MODEL}" },
    { provider: "llm", model: "${LLM_VISION_MODEL:-${LLM_MODEL}}" },
    { provider: "gemini", model: "${GEMINI_MODEL:-gemini-2.0-flash}" },
    { provider: "openai", model: "${OPENAI_VISION_MODEL:-gpt-4o-mini}" },
    { provider: "anthropic", model: "${ANTHROPIC_VISION_MODEL:-claude-3-5-sonnet-latest}" },
  ],
};

const expand = (v: string, e: NodeJS.ProcessEnv): string => {
  let out = v;
  for (let i = 0; i < 3 && out.includes("${"); i++) {
    out = out.replace(/\$\{(\w+)(?::-([^${}]*))?\}/g, (_m, name: string, fb?: string) => e[name]?.trim() || fb || "");
  }
  return out;
};

/** Which environment variables hold the keys of each provider (and the id its first key is registered under). */
const KEY_PREFIX: Record<string, string> = { openrouter: "OPENROUTER", gemini: "GEMINI", openai: "OPENAI", xai: "XAI", anthropic: "ANTHROPIC", llm: "LLM" };
const MAX_KEYS = 20;

/**
 * Every API key of one provider, in order, without duplicates. Any mix of these works:
 *   GEMINI_API_KEY=k1                 (the original single key)
 *   GEMINI_API_KEYS=k1,k2,k3          (comma, semicolon or new line separated)
 *   GEMINI_API_KEY_2=k2  ...  GEMINI_API_KEY_20=k20
 * Several keys = several "slots": when one runs out of quota or is rate limited, the next key answers.
 */
export function keysFor(provider: string, e: NodeJS.ProcessEnv): string[] {
  const prefix = KEY_PREFIX[provider];
  if (!prefix) return [];
  const split = (v?: string) => (v ?? "").split(/[\s,;]+/).map((k) => k.trim()).filter(Boolean);
  const all = [...split(e[`${prefix}_API_KEY`]), ...split(e[`${prefix}_API_KEYS`])];
  for (let i = 2; i <= MAX_KEYS; i++) all.push(...split(e[`${prefix}_API_KEY_${i}`]));
  return [...new Set(all)];
}

/** Provider id of key number `index` (0-based): "gemini", "gemini#2", "gemini#3", ... */
export const slotId = (provider: string, index: number) => (index === 0 ? provider : `${provider}#${index + 1}`);

/** A key shown safely: only its last 4 characters. */
export const maskKey = (k: string) => (k.length > 8 ? `…${k.slice(-4)}` : "…");

/** How many key slots a provider has (a keyless "llm" server counts as one). */
function slotCount(provider: string, e: NodeJS.ProcessEnv): number {
  const n = keysFor(provider, e).length;
  return n > 0 ? n : provider === "llm" && e.LLM_API_URL?.trim() ? 1 : 0;
}

export function buildProviders(e: NodeJS.ProcessEnv): Map<string, Provider> {
  const map = new Map<string, Provider>();
  const val = (n: string) => e[n]?.trim() || "";
  keysFor("openrouter", e).forEach((k, i) => map.set(slotId("openrouter", i), new OpenAICompatibleProvider(slotId("openrouter", i), "https://openrouter.ai/api/v1", k)));
  keysFor("gemini", e).forEach((k, i) => map.set(slotId("gemini", i), new GeminiProvider(k, val("GEMINI_BASE_URL") || undefined)));
  keysFor("openai", e).forEach((k, i) => map.set(slotId("openai", i), new OpenAICompatibleProvider(slotId("openai", i), val("OPENAI_BASE_URL") || "https://api.openai.com/v1", k)));
  keysFor("xai", e).forEach((k, i) => map.set(slotId("xai", i), new OpenAICompatibleProvider(slotId("xai", i), val("XAI_BASE_URL") || "https://api.x.ai/v1", k)));
  keysFor("anthropic", e).forEach((k, i) => map.set(slotId("anthropic", i), new AnthropicProvider(k, val("ANTHROPIC_BASE_URL") || undefined)));
  if (val("LLM_API_KEY") || val("LLM_API_KEYS") || val("LLM_API_URL")) {
    const url = (val("LLM_API_URL") || "https://openrouter.ai/api/v1/chat/completions").replace(/\/chat\/completions$/, "");
    const keys = keysFor("llm", e);
    (keys.length ? keys : [undefined]).forEach((k, i) => map.set(slotId("llm", i), new OpenAICompatibleProvider(slotId("llm", i), url, k)));
  }
  return map;
}

/**
 * Turns the routing list into the chain that is actually tried. A provider with several keys appears several times in a
 * row (key 1, key 2, ...), so when one key is used up the NEXT KEY of the same provider answers before any other provider.
 */
export function buildRouting(raw: { text?: Candidate[]; image?: Candidate[] }, e: NodeJS.ProcessEnv): Routing {
  const fix = (list: Candidate[] = []) => list.filter((c) => c && typeof c.provider === "string" && typeof c.model === "string")
    .flatMap((c) => {
      const model = expand(c.model, e);
      const n = slotCount(c.provider, e);
      return n > 1 ? Array.from({ length: n }, (_x, i) => ({ provider: slotId(c.provider, i), model })) : [{ provider: c.provider, model }];
    });
  return { text: fix(raw.text), image: fix(raw.image) };
}

function loadRoutingFile(): { text?: Candidate[]; image?: Candidate[] } {
  const file = process.env.AI_ROUTING_FILE || path.resolve(process.cwd(), "ai-routing.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { routes?: { text?: Candidate[]; image?: Candidate[] } };
    if (parsed.routes) return parsed.routes;
  } catch { /* no file: use defaults */ }
  return DEFAULT_ROUTING;
}

export interface AIStatus {
  enabled: boolean;
  visionEnabled: boolean;
  providers: string[];
  routes: Record<Kind, string[]>;
  /** How many keys each provider has, and the last 4 characters of each (never the whole key). */
  keys: Record<string, string[]>;
  coolingDown: { key: string; remainingMs: number }[];
  disabled: { key: string; reason: string }[];
}

export class AIRouter {
  private providers = buildProviders(process.env);
  private routing = buildRouting(loadRoutingFile(), process.env);
  private cooldowns = new CooldownTracker(env.NODE_ENV === "test" ? undefined : path.resolve(process.cwd(), ".ai-router-state.json"));

  /** For tests / hot reload. */
  configure(providers: Map<string, Provider>, routing: Routing, cooldowns = new CooldownTracker()) {
    this.providers = providers; this.routing = routing; this.cooldowns = cooldowns;
  }

  private usable(kind: Kind) {
    return this.routing[kind].filter((c) => this.providers.has(c.provider) && c.model && (kind === "text" || this.providers.get(c.provider)!.vision));
  }
  get enabled() { return this.usable("text").length > 0; }
  get visionEnabled() { return this.usable("image").length > 0; }

  complete(prompt: string): Promise<RouteResult> {
    return respond("text", prompt, undefined, this.deps());
  }
  completeImage(prompt: string, image: ImageInput): Promise<RouteResult> {
    return respond("image", prompt, image, this.deps());
  }

  status(): AIStatus {
    const names = (k: Kind) => this.usable(k).map((c) => `${c.provider}/${c.model}`);
    return {
      enabled: this.enabled, visionEnabled: this.visionEnabled, providers: [...this.providers.keys()],
      routes: { text: names("text"), image: names("image") },
      keys: Object.fromEntries(Object.keys(KEY_PREFIX).map((p) => [p, keysFor(p, process.env).map(maskKey)]).filter(([, v]) => (v as string[]).length > 0)),
      coolingDown: this.cooldowns.active(), disabled: this.cooldowns.disabledList(),
    };
  }

  private deps() {
    return { routing: this.routing, providers: this.providers, cooldowns: this.cooldowns, log: (m: string) => logger.warn(m) };
  }
}

export const aiRouter = new AIRouter();
