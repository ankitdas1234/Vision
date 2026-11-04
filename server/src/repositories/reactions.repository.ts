import { db } from "../database/client";
import { reactions } from "../database/schema";
import { desc } from "drizzle-orm";

export const reactionsRepository = {
  async record(input: typeof reactions.$inferInsert) { const [row] = await db.insert(reactions).values(input).returning(); return row; },
  async recent(limit = 50) { return db.select().from(reactions).orderBy(desc(reactions.createdAt)).limit(limit); },
};
