import { db } from "../database/client";
import { people } from "../database/schema";
import { eq, ilike } from "drizzle-orm";

export const peopleRepository = {
  async list() { return db.select().from(people); },
  async findById(id: string) { const [row] = await db.select().from(people).where(eq(people.id, id)); return row ?? null; },
  /** Case-insensitive exact-name match, single result — kept for any
   * caller that genuinely only wants "the first match". Most callers
   * (e.g. "find <name>" style commands) should use findAllByName instead
   * and handle the multiple-people-share-a-name case explicitly rather
   * than silently picking one. */
  async findByName(name: string) {
    const [row] = await db.select().from(people).where(ilike(people.name, name));
    return row ?? null;
  },
  /** Every person with this name (case-insensitive) — a name is NOT a
   * unique identifier (a household can easily have two "Sam"s), so any
   * "find this person" behavior needs to handle 0, 1, or many results
   * explicitly. See people/PersonSearchRunner.ts for the "many results ->
   * require a photo to disambiguate" logic this exists for. */
  async findAllByName(name: string) {
    return db.select().from(people).where(ilike(people.name, name));
  },
  async create(input: typeof people.$inferInsert) { const [row] = await db.insert(people).values(input).returning(); return row; },
  async update(id: string, patch: Partial<typeof people.$inferInsert>) {
    const [row] = await db.update(people).set({ ...patch, updatedAt: new Date() }).where(eq(people.id, id)).returning();
    return row ?? null;
  },
};
