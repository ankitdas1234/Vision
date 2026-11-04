import { db } from "../database/client";
import { personFaces, people, FACE_EMBEDDING_DIMENSIONS } from "../database/schema";
import { eq, sql, and } from "drizzle-orm";
import { faceRecognitionConfig } from "../config/faceRecognitionConfig";

export interface FaceEmbeddingCandidate {
  faceId: string;
  personId: string;
  distance: number;
  name: string | null;
  category: string;
  backend: string;
}

function padToStorageWidth(embedding: number[]): number[] {
  if (embedding.length >= FACE_EMBEDDING_DIMENSIONS) return embedding.slice(0, FACE_EMBEDDING_DIMENSIONS);
  return [...embedding, ...new Array(FACE_EMBEDDING_DIMENSIONS - embedding.length).fill(0)];
}

export const personFacesRepository = {
  async create(input: { personId: string; embedding: number[]; backend: string; mediaId?: string | null; qualityScore?: number | null }) {
    const [row] = await db
      .insert(personFaces)
      .values({
        personId: input.personId,
        embedding: padToStorageWidth(input.embedding),
        backend: input.backend,
        dimensions: input.embedding.length,
        qualityScore: input.qualityScore ?? null,
        mediaId: input.mediaId ?? null,
      })
      .returning();

    await this.pruneLowestQualityIfOverCap(input.personId);
    return row;
  },

  async forPerson(personId: string) {
    return db.select().from(personFaces).where(eq(personFaces.personId, personId));
  },

  /** "That's not me" — clears every registered face for this person so
   * the next real detection (already real ML, see
   * perception/faceEmbedding.ts) registers a fresh embedding from
   * scratch, rather than trying to surgically identify which single
   * stored embedding was the bad match. Simple and honest: the person
   * just gets re-learned next time they're in frame. */
  async deleteAllForPerson(personId: string): Promise<number> {
    const existing = await this.forPerson(personId);
    if (existing.length === 0) return 0;
    await db.delete(personFaces).where(eq(personFaces.personId, personId));
    return existing.length;
  },

  /**
   * DB-side nearest-neighbor search via the HNSW index (see
   * database/migrations/0005_pgvector_face_embeddings.sql) instead of
   * pulling every registered face into the app and computing distance in
   * JS — this is what actually makes recognition scale past a handful of
   * registered people. Scoped to the same `backend` as the query
   * embedding, since distances from different embedding models aren't on
   * a comparable scale (see perception/embedding/types.ts).
   *
   * Returns up to `limit` nearest candidates (default: comfortably above
   * the voting window size — see config faceRecognitionConfig.voting —
   * so multi-frame voting has enough distinct candidates to work with,
   * not just the single closest one).
   */
  async findNearest(embedding: number[], backend: string, limit = 10): Promise<FaceEmbeddingCandidate[]> {
    const padded = padToStorageWidth(embedding);
    const literal = `[${padded.join(",")}]`;

    const rows = await db
      .select({
        faceId: personFaces.id,
        personId: personFaces.personId,
        distance: sql<number>`${personFaces.embedding} <-> ${literal}::vector`,
        name: people.name,
        category: people.category,
        backend: personFaces.backend,
      })
      .from(personFaces)
      .innerJoin(people, eq(personFaces.personId, people.id))
      .where(eq(personFaces.backend, backend))
      .orderBy(sql`${personFaces.embedding} <-> ${literal}::vector`)
      .limit(limit);

    return rows;
  },

  /** Keeps at most `matching.maxStoredFacesPerPerson` reference faces per
   * person, dropping the lowest-quality ones first — so a person
   * accumulating hundreds of registrations over time doesn't
   * unboundedly grow the per-person candidate set or bias matching
   * toward whichever pose/lighting happened to get captured most often. */
  async pruneLowestQualityIfOverCap(personId: string): Promise<void> {
    const cap = faceRecognitionConfig.matching.maxStoredFacesPerPerson;
    const rows = await db
      .select({ id: personFaces.id, qualityScore: personFaces.qualityScore })
      .from(personFaces)
      .where(eq(personFaces.personId, personId));

    if (rows.length <= cap) return;

    const sorted = [...rows].sort((a, b) => (a.qualityScore ?? 0) - (b.qualityScore ?? 0));
    const toRemove = sorted.slice(0, rows.length - cap);
    for (const row of toRemove) {
      await db.delete(personFaces).where(eq(personFaces.id, row.id));
    }
  },

  async countForPerson(personId: string, backend?: string): Promise<number> {
    const condition = backend ? and(eq(personFaces.personId, personId), eq(personFaces.backend, backend)) : eq(personFaces.personId, personId);
    const rows = await db.select({ id: personFaces.id }).from(personFaces).where(condition);
    return rows.length;
  },
};
