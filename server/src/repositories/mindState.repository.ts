import { eq } from "drizzle-orm";
import { db } from "../database/client";
import { simulationMindState } from "../database/schema";

/** Autonomous simulator state, one JSON document per dashboard user. Simulation only. */
export const mindStateRepository = {
  get: async (userId: string) => {
    const [row] = await db.select().from(simulationMindState).where(eq(simulationMindState.userId, userId));
    return row ?? null;
  },
  put: async (userId: string, state: unknown) =>
    (
      await db
        .insert(simulationMindState)
        .values({ userId, state })
        .onConflictDoUpdate({ target: simulationMindState.userId, set: { state, updatedAt: new Date() } })
        .returning()
    )[0],
  delete: (userId: string) => db.delete(simulationMindState).where(eq(simulationMindState.userId, userId)),
};
