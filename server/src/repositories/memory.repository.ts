import { eq, desc, and, isNotNull } from "drizzle-orm";
import { db } from "../database/client";
import { staticMemories, dynamicMemories, conceptualMemories, objects, objectFeatures } from "../database/schema";
import type { VisualFeatures } from "../perception/featureExtraction";

export const memoryRepository = {
  static: {
    list: () => db.select().from(staticMemories),
    deleteByKey: (memoryKey: string) => db.delete(staticMemories).where(eq(staticMemories.memoryKey, memoryKey)),
    create: async (input: typeof staticMemories.$inferInsert) => (await db.insert(staticMemories).values(input).returning())[0],
    /**
     * Insert-or-update by `memoryKey` (which is UNIQUE in the schema) —
     * mirrors StaticMemory.upsert()'s in-memory semantics, so re-running
     * database/seed/static-memory.seed.ts is idempotent instead of
     * throwing a duplicate-key error the second time it's run.
     */
    upsert: async (input: typeof staticMemories.$inferInsert) =>
      (
        await db
          .insert(staticMemories)
          .values(input)
          .onConflictDoUpdate({
            target: staticMemories.memoryKey,
            set: {
              memoryType: input.memoryType,
              title: input.title,
              content: input.content,
              importance: input.importance,
              metadata: input.metadata,
              updatedAt: new Date(),
            },
          })
          .returning()
      )[0],
  },
  dynamic: {
    list: () => db.select().from(dynamicMemories),
    delete: (id: string) => db.delete(dynamicMemories).where(eq(dynamicMemories.id, id)),
    create: async (input: typeof dynamicMemories.$inferInsert) => (await db.insert(dynamicMemories).values(input).returning())[0],
    /** Every fact Vision has learned/inferred about one specific person —
     * this is the provenance trail an admin sees on that person's profile
     * page: what was said/observed (`source`), how confident the system
     * was (`confidence`), and whether it's been human-checked
     * (`verificationStatus`/`requiresReview`). Newest first, since a
     * recent correction is usually the one an admin cares about seeing. */
    forPerson: (personId: string) =>
      db.select().from(dynamicMemories).where(eq(dynamicMemories.personId, personId)).orderBy(desc(dynamicMemories.createdAt)),
    findById: async (id: string) => {
      const [row] = await db.select().from(dynamicMemories).where(eq(dynamicMemories.id, id));
      return row ?? null;
    },
    /** The next fact Vision should bring up out loud with an admin (see
     * people/MemoryReviewSelector.ts) — oldest flagged-for-review fact
     * first, so nothing sits unreviewed indefinitely just because newer
     * facts keep getting flagged too. Only ever returns facts that still
     * have a person attached (a `personId`-less dynamic memory isn't
     * something a spoken "is this right about Ram?" question makes
     * sense for). */
    nextNeedingReview: async () => {
      const [row] = await db
        .select()
        .from(dynamicMemories)
        .where(and(eq(dynamicMemories.requiresReview, true), isNotNull(dynamicMemories.personId)))
        .orderBy(dynamicMemories.createdAt)
        .limit(1);
      return row ?? null;
    },
    /** Called from the spoken review flow — people/PendingMemoryReview.ts
     * consumes an admin's "yes"/"no" reply and calls this (see
     * routes/conversation.routes.ts). Not exposed over HTTP: there's
     * deliberately no button for this in the dashboard, only Vision
     * asking out loud. Persists the status change so it survives a
     * restart — memory/MemoryPersistence.ts reloads
     * verificationStatus from the database on boot. */
    updateVerification: async (id: string, verificationStatus: "VERIFIED" | "REJECTED") => {
      const [row] = await db
        .update(dynamicMemories)
        .set({ verificationStatus, requiresReview: false, updatedAt: new Date() })
        .where(eq(dynamicMemories.id, id))
        .returning();
      return row ?? null;
    },
    /** A human correction to a fact's wording/content, distinct from just
     * accepting or rejecting it as-is — e.g. an AI-inferred "prefers loud
     * music" that an admin edits to "prefers music, but not loud". Always
     * marks the record VERIFIED and clears requiresReview, since a
     * human just personally confirmed/rewrote it. */
    correct: async (id: string, patch: { title?: string; content?: string; memoryType?: string }) => {
      const [row] = await db
        .update(dynamicMemories)
        .set({ ...patch, verificationStatus: "VERIFIED" as const, requiresReview: false, updatedAt: new Date() })
        .where(eq(dynamicMemories.id, id))
        .returning();
      return row ?? null;
    },
  },
  conceptual: {
    list: () => db.select().from(conceptualMemories),
    /**
     * Persists a newly-learned concept properly normalized across all
     * three related tables the schema already has for exactly this,
     * rather than cramming everything into one JSON blob:
     *   - `objects` — one row per distinct learned name, reused (not
     *     re-created) on repeat learning of the same name.
     *   - `object_features` — the structured shape/colour/size/etc
     *     columns that table exists specifically for.
     *   - `conceptual_memories` — the actual row
     *     memory/MemoryManager.ts's CONCEPTUAL tier compares against.
     *     `featureVector` also carries the full VisualFeatures JSON, so
     *     memory/MemoryPersistence.ts can reconstruct a usable
     *     ConceptualCandidate from this row alone on reload, without
     *     needing to join the other two tables back together.
     */
    learn: async (name: string, features: VisualFeatures, confidence: number) => {
      const existing = await db.select().from(objects).where(eq(objects.name, name)).limit(1);
      const objectRow =
        existing[0] ??
        (
          await db
            .insert(objects)
            .values({ name, category: features.shape, confidence, observationCount: 1 })
            .returning()
        )[0];

      await db.insert(objectFeatures).values({
        objectId: objectRow.id,
        shape: features.shape,
        primaryColour: features.primaryColour,
        secondaryColour: features.secondaryColour,
        estimatedSize: features.estimatedSize,
        texture: features.texture,
        aspectRatio: features.aspectRatio,
        dimensions: features.dimensions,
        visualFeatures: features.visualFeatures,
        semanticFeatures: features.semanticFeatures,
      });

      return (
        await db
          .insert(conceptualMemories)
          .values({
            objectId: objectRow.id,
            conceptName: name,
            conceptCategory: features.shape,
            confidence,
            featureVector: features,
          })
          .returning()
      )[0];
    },
  },
};
