import { aiRouter } from "./router";

export interface AICompletionRequest { prompt: string; purpose: string }
export interface AICompletionResponse { text: string; confidence: number; model: string; latencyMs: number }
export interface VisionCompletionRequest {
  imageBase64: string;
  mimeType: string;
  prompt: string;
  purpose: string;
}

/**
 * Thin client around OpenRouter's chat completions endpoint.
 * OPENROUTER_API_KEY is read server-side only and never forwarded to the frontend.
 */
export class OpenRouterClient {
  /**
   * Text completion through the multi-model router (src/ai/router): the first configured model answers,
   * and if it is out of quota / rate limited / down the next one answers silently. Name kept for the
   * many callers; it is no longer OpenRouter-only. Returns an empty result when no AI is configured.
   */
  async complete(req: AICompletionRequest): Promise<AICompletionResponse> {
    if (!aiRouter.enabled) return { text: "", confidence: 0, model: "none", latencyMs: 0 };
    const start = Date.now();
    const r = await aiRouter.complete(req.prompt);
    return { text: r.text, confidence: 0.6, model: `${r.provider}/${r.model}`, latencyMs: Date.now() - start };
  }

  /**
   * Recognition step of the vision pipeline: only ever called on frames that already passed local
   * pre-attentive filtering (frame quality + motion, see camera/imageProcessor.ts and
   * perception/motionDetection.ts), which keeps it bounded in cost and call volume. Uses the "image"
   * route, so an image-capable model answers and fallbacks stay within image-capable models.
   */
  async completeVision(req: VisionCompletionRequest): Promise<AICompletionResponse> {
    if (!aiRouter.visionEnabled) return { text: "", confidence: 0, model: "none", latencyMs: 0 };
    const start = Date.now();
    const r = await aiRouter.completeImage(req.prompt, { base64: req.imageBase64, mimeType: req.mimeType });
    return { text: r.text, confidence: 0.6, model: `${r.provider}/${r.model}`, latencyMs: Date.now() - start };
  }
}

export const openRouterClient = new OpenRouterClient();
