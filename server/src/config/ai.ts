import { env } from "./env";
import { aiRouter } from "../ai/router";

export const aiConfig = {
  /** True when at least one AI model (any provider) is configured. */
  get enabled() { return aiRouter.enabled; },
  apiKey: env.OPENROUTER_API_KEY,
  model: env.OPENROUTER_MODEL,
  baseUrl: "https://openrouter.ai/api/v1",
  // Vision (image-capable) recognition is a distinct, optional capability —
  // it requires a multimodal model, not just any OpenRouter model, and is
  // only ever called on frames that already passed local pre-attentive
  // filtering (see camera/imageProcessor.ts, perception/motionDetection.ts).
  visionModel: env.OPENROUTER_VISION_MODEL,
  get visionEnabled() {
    return aiRouter.visionEnabled;
  },
};
