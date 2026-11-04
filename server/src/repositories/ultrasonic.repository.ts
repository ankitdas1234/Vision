import { db } from "../database/client";
import { ultrasonicReadings, ultrasonicConfigurations } from "../database/schema";
import { desc } from "drizzle-orm";

export const ultrasonicRepository = {
  async recordReading(input: typeof ultrasonicReadings.$inferInsert) {
    const [row] = await db.insert(ultrasonicReadings).values(input).returning();
    return row;
  },
  async recentReadings(limit = 50) {
    return db.select().from(ultrasonicReadings).orderBy(desc(ultrasonicReadings.createdAt)).limit(limit);
  },
};
