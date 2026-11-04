import { ProviderError } from "./errors";

/** An image to send along with the prompt (base64, no data: prefix). */
export interface ImageInput { base64: string; mimeType: string }
export interface GenerateRequest { model: string; prompt: string; image?: ImageInput }
export interface Provider {
  readonly id: string;
  readonly vision: boolean;
  generate(req: GenerateRequest): Promise<string>;
}

const TIMEOUT_MS = 30_000;

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw ProviderError.fromThrown(e);
  }
  const text = await res.text();
  if (!res.ok) {
    const secs = Number(res.headers.get("retry-after"));
    throw ProviderError.fromHttp(res.status, text, Number.isFinite(secs) && secs > 0 ? secs * 1000 : undefined);
  }
  try { return JSON.parse(text); } catch { throw new ProviderError("provider returned invalid JSON", "unknown"); }
}

/** OpenAI "chat completions" protocol: OpenAI, xAI, OpenRouter, Ollama, LM Studio, Groq... */
export class OpenAICompatibleProvider implements Provider {
  constructor(readonly id: string, private baseUrl: string, private apiKey: string | undefined, readonly vision = true) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }
  async generate({ model, prompt, image }: GenerateRequest): Promise<string> {
    const content = image
      ? [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}` } }]
      : prompt;
    const data = await postJson(`${this.baseUrl}/chat/completions`, this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}, {
      model, messages: [{ role: "user", content }],
    });
    // Gateways such as OpenRouter report upstream failures as HTTP 200 with an `error` object.
    if (data?.error) throw ProviderError.fromHttp(Number(data.error.code) || 502, JSON.stringify({ error: data.error }));
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new ProviderError("empty response", "unknown");
    return text;
  }
}

export class GeminiProvider implements Provider {
  readonly id = "gemini";
  readonly vision = true;
  constructor(private apiKey: string, private baseUrl = "https://generativelanguage.googleapis.com/v1beta") {}
  async generate({ model, prompt, image }: GenerateRequest): Promise<string> {
    const parts: unknown[] = [{ text: prompt }];
    if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
    const data = await postJson(`${this.baseUrl.replace(/\/+$/, "")}/models/${encodeURIComponent(model)}:generateContent`,
      { "x-goog-api-key": this.apiKey }, { contents: [{ parts }] });
    const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
    if (!text.trim()) throw new ProviderError("empty response (possibly blocked by safety filters)", "unknown");
    return text;
  }
}

export class AnthropicProvider implements Provider {
  readonly id = "anthropic";
  readonly vision = true;
  constructor(private apiKey: string, private baseUrl = "https://api.anthropic.com/v1") {}
  async generate({ model, prompt, image }: GenerateRequest): Promise<string> {
    const content: unknown[] = [];
    if (image) content.push({ type: "image", source: { type: "base64", media_type: image.mimeType, data: image.base64 } });
    content.push({ type: "text", text: prompt });
    const data = await postJson(`${this.baseUrl.replace(/\/+$/, "")}/messages`,
      { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      { model, max_tokens: 1024, messages: [{ role: "user", content }] });
    const text = (data?.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    if (!text.trim()) throw new ProviderError("empty response", "unknown");
    return text;
  }
}
