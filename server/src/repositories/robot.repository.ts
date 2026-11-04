import { db } from "../database/client";
import { robots } from "../database/schema";
import { eq } from "drizzle-orm";

export const robotRepository = {
  async findByCode(robotCode: string) {
    const [row] = await db.select().from(robots).where(eq(robots.robotCode, robotCode));
    return row ?? null;
  },
  async recordHeartbeat(id: string, patch: Partial<typeof robots.$inferInsert>) {
    return db.update(robots).set({ ...patch, lastHeartbeat: new Date(), updatedAt: new Date() }).where(eq(robots.id, id));
  },
  /**
   * The robot's very first heartbeat is what brings it into existence in
   * the database — nobody has to manually register hardware before the
   * brain can start logging person encounters, media, and vision stats
   * against it. Every heartbeat after that just updates status/telemetry
   * fields on the existing row. See routes/telemetry.routes.ts.
   */
  async upsertHeartbeat(robotCode: string, patch: Partial<typeof robots.$inferInsert> = {}) {
    const existing = await this.findByCode(robotCode);
    if (existing) {
      const [row] = await db
        .update(robots)
        .set({ ...patch, status: "ONLINE", lastHeartbeat: new Date(), updatedAt: new Date() })
        .where(eq(robots.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db
      .insert(robots)
      .values({ robotCode, status: "ONLINE", lastHeartbeat: new Date(), ...patch })
      .returning();
    return row;
  },
  async setLocation(id: string, currentLocation: string) {
    const [row] = await db.update(robots).set({ currentLocation, updatedAt: new Date() }).where(eq(robots.id, id)).returning();
    return row ?? null;
  },
  async list() {
    return db.select().from(robots);
  },
};
