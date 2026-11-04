import { db } from "../database/client";
import { mediaFiles } from "../database/schema";
import { eq } from "drizzle-orm";

export const mediaFilesRepository = {
  async create(input: typeof mediaFiles.$inferInsert) {
    const [row] = await db.insert(mediaFiles).values(input).returning();
    return row;
  },
  async findById(id: string) {
    const [row] = await db.select().from(mediaFiles).where(eq(mediaFiles.id, id));
    return row ?? null;
  },
};
