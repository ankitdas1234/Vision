import { openRouterClient } from "./OpenRouterClient";

/** Called only when static/dynamic/conceptual memory are all insufficient. */
export async function aiFallback(query: string) {
  try {
    const result = await openRouterClient.complete({ prompt: query, purpose: "memory_fallback" });
    // No AI configured (or an empty reply) is a miss, not an answer: otherwise the lookup says
    // "answered by the AI" with blank text.
    if (!result.text.trim()) return { text: "", confidence: 0, success: false, error: "No AI model is configured or it returned nothing" };
    return { text: result.text, confidence: result.confidence, success: true };
  } catch (err) {
    return { text: "", confidence: 0, success: false, error: (err as Error).message };
  }
}
