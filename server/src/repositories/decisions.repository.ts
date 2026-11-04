import { db } from "../database/client";
import { decisions } from "../database/schema";
import { desc } from "drizzle-orm";

export const decisionsRepository = {
  async record(input: typeof decisions.$inferInsert) { const [row] = await db.insert(decisions).values(input).returning(); return row; },
  async recent(limit = 50) { return db.select().from(decisions).orderBy(desc(decisions.createdAt)).limit(limit); },
};
