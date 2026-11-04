import { db } from "../database/client";
import { telemetry } from "../database/schema";

export const telemetryRepository = {
  async record(input: typeof telemetry.$inferInsert) {
    const [row] = await db.insert(telemetry).values(input).returning();
    return row;
  },
  async list() { return db.select().from(telemetry); },
};
