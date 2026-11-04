import { memoryRepository } from "../repositories/memory.repository";
import type { MemoryManager } from "./MemoryManager";
import type { VisualFeatures } from "../perception/featureExtraction";
import type { VerificationStatus } from "../packages/types";
import { logger } from "../logging/Logger";

/**
 * Loads every persisted memory record from the database back into a
 * MemoryManager's in-memory indexes — call once at server startup (see
 * index.ts). Without this, `new MemoryManager()` always starts with
 * empty static/dynamic/conceptual arrays, so everything Vision has ever
 * been told or has learned would be silently lost on every restart, even
 * though it was correctly written to the database the whole time (see
 * repositories/memory.repository.ts and MemoryManager.ts's learning
 * step) — this was a real, previously-unfixed gap, not a hypothetical
 * one.
 *
 * Resilient by design: if the database isn't reachable (local dev/tests
 * without Postgres running, for instance), this logs a warning and
 * leaves the MemoryManager empty rather than crashing server startup —
 * the same "degraded but running" posture the rest of this codebase
 * already takes toward a missing database, not a new failure mode.
 */
export async function loadMemoryFromDatabase(memoryManager: MemoryManager): Promise<void> {
  try {
    const staticRows = await memoryRepository.static.list();
    for (const row of staticRows) {
      memoryManager.staticMemory.upsert({
        id: row.id,
        memoryKey: row.memoryKey,
        memoryType: row.memoryType,
        title: row.title,
        content: row.content,
        importance: row.importance,
      });
    }

    const dynamicRows = await memoryRepository.dynamic.list();
    for (const row of dynamicRows) {
      memoryManager.dynamicMemory.add({
        id: row.id,
        title: row.title,
        content: row.content,
        source: row.source,
        confidence: row.confidence,
        importance: row.importance,
        verificationStatus: row.verificationStatus as VerificationStatus,
        createdAt: row.createdAt.toISOString(),
        tag: row.memoryType ?? undefined,
      });
    }

    const conceptualRows = await memoryRepository.conceptual.list();
    let conceptualLoaded = 0;
    for (const row of conceptualRows) {
      // featureVector is nullable in the schema — a row without one
      // can't be turned back into a comparable candidate, so it's
      // skipped here (still visible via GET /api/objects either way).
      if (!row.featureVector) continue;
      memoryManager.conceptualMemory.addCandidate({
        id: row.id,
        name: row.conceptName,
        features: row.featureVector as VisualFeatures,
      });
      conceptualLoaded++;
    }

    logger.info("Memory loaded from database", {
      static: staticRows.length,
      dynamic: dynamicRows.length,
      conceptual: conceptualLoaded,
      conceptualSkippedNoFeatureVector: conceptualRows.length - conceptualLoaded,
    });
  } catch (err) {
    logger.warn(
      "Could not load memory from database — starting with empty in-memory memory (expected if Postgres isn't running, e.g. local dev without a database or the test environment)",
      { error: (err as Error).message },
    );
  }
}