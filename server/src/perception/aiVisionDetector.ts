import { openRouterClient } from "../ai/OpenRouterClient";
import { logger } from "../logging/Logger";
import type { DetectionContext } from "./perceptionContext";
import type { PersonDetector, PersonDetection } from "./personDetection";
import type { ObjectDetector, ObjectDetection } from "./objectDetection";

/**
 * RECOGNITION STAGE (AI-backed)
 * -----------------------------
 * Local motion/quality filtering answers "is something here" (detection).
 * This module answers "what is it" (recognition) using an actual
 * vision-capable model — the closest equivalent this codebase has to the
 * human visual cortex's object-recognition step, versus the retina-level
 * pre-processing done locally.
 *
 * It is only ever reached after DetectionContext already contains a
 * present, non-trivial motion ROI (wired in brain/perception.ts) — the
 * same efficiency principle a human uses by not consciously "thinking
 * hard" about every part of a static scene, only what already caught
 * their eye.
 */

const RECOGNITION_PROMPT = `You are the object/person recognition stage of a small home robot's vision system.
Look at the attached image and report ONLY what is clearly visible.
Respond with strict JSON and nothing else (no markdown fences, no prose):
{
  "personPresent": boolean,
  "personBox": [x, y, width, height] as fractions of image size (0-1), or null,
  "personConfidence": number between 0 and 1,
  "objects": [
    { "name": string, "category": string, "confidence": number, "box": [x, y, width, height] as fractions }
  ]
}
If you are not confident about something, omit it rather than guessing.`;

interface RawVisionResult {
  personPresent?: boolean;
  personBox?: [number, number, number, number] | null;
  personConfidence?: number;
  objects?: { name?: string; category?: string; confidence?: number; box?: [number, number, number, number] }[];
}

function safeParseJson(text: string): RawVisionResult | null {
  try {
    const cleaned = text.trim().replace(/^```json\s*|^```\s*|```$/g, "");
    return JSON.parse(cleaned) as RawVisionResult;
  } catch {
    return null;
  }
}

function boxFromFraction(
  box: [number, number, number, number] | null | undefined,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } | undefined {
  if (!box || box.length !== 4) return undefined;
  const [x, y, w, h] = box;
  return {
    x: Math.round(x * width),
    y: Math.round(y * height),
    width: Math.round(w * width),
    height: Math.round(h * height),
  };
}

/** Shared per-frame vision call, cached for the duration of a single
 * observation so the person detector and object detector (both invoked in
 * the same brain cycle) don't each trigger a separate, billable AI call
 * for the same frame. */
class AIVisionPerceiver {
  private cache = new Map<string, Promise<RawVisionResult | null>>();

  private async perceive(ctx: DetectionContext): Promise<RawVisionResult | null> {
    const cacheKey = ctx.quality.checksum;
    let pending = this.cache.get(cacheKey);
    if (!pending) {
      pending = this.callModel(ctx);
      this.cache.set(cacheKey, pending);
      // Bound cache growth — this is a per-request convenience, not a store.
      if (this.cache.size > 8) {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey) this.cache.delete(oldestKey);
      }
    }
    return pending;
  }

  private async callModel(ctx: DetectionContext): Promise<RawVisionResult | null> {
    try {
      const response = await openRouterClient.completeVision({
        imageBase64: ctx.imageBuffer.toString("base64"),
        mimeType: "image/jpeg",
        prompt: RECOGNITION_PROMPT,
        purpose: "vision_recognition",
      });
      if (!response.text) return null;
      const parsed = safeParseJson(response.text);
      if (!parsed) logger.warn("AI vision response was not valid JSON", { purpose: "vision_recognition" });
      return parsed;
    } catch (err) {
      logger.warn("AI vision recognition call failed", { error: (err as Error).message });
      return null;
    }
  }

  async getPerson(ctx: DetectionContext): Promise<PersonDetection> {
    const parsed = await this.perceive(ctx);
    if (!parsed?.personPresent) return { personDetected: false };
    const boundingBox = boxFromFraction(parsed.personBox, ctx.width, ctx.height);
    return {
      personDetected: true,
      boundingBox,
      centerX: boundingBox ? boundingBox.x + boundingBox.width / 2 : undefined,
      centerY: boundingBox ? boundingBox.y + boundingBox.height / 2 : undefined,
      confidence: parsed.personConfidence ?? 0.5,
    };
  }

  async getObjects(ctx: DetectionContext): Promise<ObjectDetection[]> {
    const parsed = await this.perceive(ctx);
    if (!parsed?.objects?.length) return [];
    return parsed.objects
      .filter((o) => o.name)
      .map((o) => ({
        name: o.name as string,
        category: o.category ?? "unknown",
        confidence: o.confidence ?? 0.4,
        boundingBox: boxFromFraction(o.box, ctx.width, ctx.height) ?? { x: 0, y: 0, width: 0, height: 0 },
      }));
  }
}

const aiVisionPerceiver = new AIVisionPerceiver();

export class AIVisionPersonDetector implements PersonDetector {
  async detect(ctx: DetectionContext): Promise<PersonDetection> {
    return aiVisionPerceiver.getPerson(ctx);
  }
}

export class AIVisionObjectDetector implements ObjectDetector {
  async detect(ctx: DetectionContext): Promise<ObjectDetection[]> {
    return aiVisionPerceiver.getObjects(ctx);
  }
}
