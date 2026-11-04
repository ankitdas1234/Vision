import { initialVerificationStatus } from "./verification";
import type { VerificationStatus } from "../../packages/types";

export interface DynamicMemoryRecord {
  id: string;
  title: string;
  content: string;
  source: string;
  confidence: number;
  importance: number;
  verificationStatus: VerificationStatus;
  createdAt: string;
  /** Optional topic label an admin gave it (stored in memory_type). */
  tag?: string;
}

export function createDynamicMemory(input: { id: string; title: string; content: string; source: string; confidence: number; importance?: number; tag?: string }): DynamicMemoryRecord {
  return {
    tag: input.tag,
    id: input.id,
    title: input.title,
    content: input.content,
    source: input.source,
    confidence: input.confidence,
    importance: input.importance ?? 0.5,
    verificationStatus: initialVerificationStatus(input.source, input.confidence),
    createdAt: new Date().toISOString(),
  };
}
