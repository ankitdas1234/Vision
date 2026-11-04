import { db } from "../database/client";
import { tasks } from "../database/schema";

export const tasksRepository = {
  async list() { return db.select().from(tasks); },
  async create(input: typeof tasks.$inferInsert) { const [row] = await db.insert(tasks).values(input).returning(); return row; },
};
