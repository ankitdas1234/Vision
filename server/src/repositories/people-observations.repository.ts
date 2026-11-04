import { db } from "../database/client";
import { personObservations, personInteractions } from "../database/schema";
import { eq, desc } from "drizzle-orm";

export const personObservationsRepository = {
  async record(input: typeof personObservations.$inferInsert) { const [row] = await db.insert(personObservations).values(input).returning(); return row; },
  async forPerson(personId: string) { return db.select().from(personObservations).where(eq(personObservations.personId, personId)).orderBy(desc(personObservations.createdAt)); },
  async hasTalkedBefore(personId: string) {
    const rows = await db.select().from(personObservations).where(eq(personObservations.personId, personId));
    return rows.some((r) => r.talkedTo);
  },
};

export const personInteractionsRepository = {
  async record(input: typeof personInteractions.$inferInsert) { const [row] = await db.insert(personInteractions).values(input).returning(); return row; },
  async forPerson(personId: string) { return db.select().from(personInteractions).where(eq(personInteractions.personId, personId)).orderBy(desc(personInteractions.createdAt)); },
};
