import { eq, desc } from "drizzle-orm";
import { db } from "../database/client";
import { objects, objectFeatures, objectObservations, observations, mediaFiles, conceptualMemories } from "../database/schema";

export const objectsRepository = {
  async list() { return db.select().from(objects); },
  async findById(id: string) {
    const [row] = await db.select().from(objects).where(eq(objects.id, id));
    return row ?? null;
  },
  async create(input: typeof objects.$inferInsert) { const [row] = await db.insert(objects).values(input).returning(); return row; },
  /** The structured shape/colour/size/texture rows this object accumulated
   * — see memory.repository.ts's conceptual.learn(), which is what
   * populates these. An object can have more than one (re-learned under
   * slightly different conditions), so this returns all of them rather
   * than assuming exactly one row per object. */
  async featuresFor(objectId: string) {
    return db.select().from(objectFeatures).where(eq(objectFeatures.objectId, objectId));
  },
  /** Every time this object was actually seen, joined back to the photo
   * from that sighting (when one was stored) — the "here's the object,
   * and here's the evidence" history for the profile page, mirroring
   * what routes/people.routes.ts's /people/:id/timeline does for people. */
  async observationsFor(objectId: string) {
    const links = await db
      .select({
        observationId: objectObservations.observationId,
        linkedAt: objectObservations.createdAt,
      })
      .from(objectObservations)
      .where(eq(objectObservations.objectId, objectId))
      .orderBy(desc(objectObservations.createdAt));

    const rows = await Promise.all(
      links.map(async (link) => {
        const [obs] = await db.select().from(observations).where(eq(observations.id, link.observationId));
        if (!obs) return null;
        const media = obs.mediaId ? (await db.select().from(mediaFiles).where(eq(mediaFiles.id, obs.mediaId)))[0] : null;
        return {
          id: obs.id,
          description: obs.description,
          confidence: obs.confidence,
          source: obs.source,
          createdAt: obs.createdAt,
          context: obs.context,
          photoUrl: media?.googleDriveUrl ?? null,
        };
      }),
    );
    return rows.filter((r): r is NonNullable<typeof r> => r !== null);
  },
  /** Every "I think this is a/an X" conceptual-memory record generated
   * for this object — each one carries its own confidence, so the
   * profile page can honestly show *how sure* Vision was, not just the
   * final name. See memory.repository.ts's conceptual.learn(). */
  async conceptualMemoriesFor(objectId: string) {
    return db.select().from(conceptualMemories).where(eq(conceptualMemories.objectId, objectId)).orderBy(desc(conceptualMemories.createdAt));
  },
};
