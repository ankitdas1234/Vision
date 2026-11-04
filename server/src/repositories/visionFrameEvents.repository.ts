import { db } from "../database/client";
import { visionFrameEvents } from "../database/schema";
import { desc, eq, sql } from "drizzle-orm";

export const visionFrameEventsRepository = {
  async record(input: typeof visionFrameEvents.$inferInsert) {
    const [row] = await db.insert(visionFrameEvents).values(input).returning();
    return row;
  },

  async recent(robotId?: string, limit = 100) {
    const query = db.select().from(visionFrameEvents).orderBy(desc(visionFrameEvents.createdAt)).limit(limit);
    return robotId ? query.where(eq(visionFrameEvents.robotId, robotId)) : query;
  },

  /** Aggregate counts per outcome over all recorded history — the durable
   * counterpart to camera/visionStats.ts's in-memory, since-last-restart gauge. */
  async summary(robotId?: string) {
    const base = db
      .select({ outcome: visionFrameEvents.outcome, count: sql<number>`count(*)::int` })
      .from(visionFrameEvents)
      .groupBy(visionFrameEvents.outcome);
    const rows = robotId ? await base.where(eq(visionFrameEvents.robotId, robotId)) : await base;
    return rows;
  },
};
