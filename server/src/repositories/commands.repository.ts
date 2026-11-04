import { db } from "../database/client";
import { commandHistory } from "../database/schema";

export const commandsRepository = {
  async log(input: typeof commandHistory.$inferInsert) {
    const [row] = await db.insert(commandHistory).values(input).returning();
    return row;
  },
  async list() { return db.select().from(commandHistory); },
};
