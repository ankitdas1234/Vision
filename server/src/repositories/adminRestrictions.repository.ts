import { db } from "../database/client";
import { adminRestrictions } from "../database/schema";
import { and, eq, isNull, or } from "drizzle-orm";

export const adminRestrictionsRepository = {
  async listActive() {
    return db.select().from(adminRestrictions).where(eq(adminRestrictions.active, true));
  },
  async create(input: typeof adminRestrictions.$inferInsert) {
    const [row] = await db.insert(adminRestrictions).values(input).returning();
    return row;
  },
  /** Lifts every active restriction on a command type (optionally scoped to one person). */
  async liftByCommandType(commandType: string, scopedPersonId?: string | null) {
    return db
      .update(adminRestrictions)
      .set({ active: false, liftedAt: new Date() })
      .where(
        and(
          eq(adminRestrictions.commandType, commandType),
          eq(adminRestrictions.active, true),
          scopedPersonId ? eq(adminRestrictions.scopedPersonId, scopedPersonId) : or(isNull(adminRestrictions.scopedPersonId))
        )
      );
  },
  async lift(id: string) {
    return db.update(adminRestrictions).set({ active: false, liftedAt: new Date() }).where(eq(adminRestrictions.id, id));
  },
};
