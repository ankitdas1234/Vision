import { db } from "../database/client";
import { observations } from "../database/schema";

export const observationsRepository = {
  async create(input: typeof observations.$inferInsert) {
    const [row] = await db.insert(observations).values(input).returning();
    return row;
  },
  async list() { return db.select().from(observations); },
};
