import { db } from "../database/client";
import { speechEvents } from "../database/schema";
import { and, eq, gte, sql } from "drizzle-orm";

export const speechEventsRepository = {
  async record(input: typeof speechEvents.$inferInsert) {
    const [row] = await db.insert(speechEvents).values(input).returning();
    return row;
  },
  /** Count of INTERRUPTION events for a person in the last `windowMinutes` — the
   * "talks too much" signal ConversationArbiterService uses to lower someone's
   * priority the next time they overlap with someone else. */
  async interruptionCount(personId: string, windowMinutes: number): Promise<number> {
    const since = new Date(Date.now() - windowMinutes * 60_000);
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(speechEvents)
      .where(and(eq(speechEvents.personId, personId), eq(speechEvents.eventType, "INTERRUPTION"), gte(speechEvents.createdAt, since)));
    return Number(row?.count ?? 0);
  },
  async recentForPerson(personId: string, limit = 20) {
    return db.select().from(speechEvents).where(eq(speechEvents.personId, personId)).limit(limit);
  },
};
