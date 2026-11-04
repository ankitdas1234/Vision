import { and, eq } from "drizzle-orm";
import { db } from "../client";
import { gaitConfigurations, gaitPhases } from "../schema";

export async function seedGait(robotId: string) {
  const [already] = await db.select({ id: gaitConfigurations.id }).from(gaitConfigurations).where(and(eq(gaitConfigurations.robotId, robotId), eq(gaitConfigurations.name, "walk_forward"))).limit(1);
  if (already) return; // re-running the seed must not duplicate the gait
  const [cfg] = await db.insert(gaitConfigurations).values({
    robotId, name: "walk_forward", gaitType: "FORWARD", stepDuration: 400, defaultSpeed: 60,
  }).returning();

  await db.insert(gaitPhases).values([
    { gaitConfigurationId: cfg.id, phaseNumber: 1, durationMs: 400, leftRotationSpeed: 60, leftRotationDirection: "FORWARD", rightRotationSpeed: 60, rightRotationDirection: "FORWARD" },
    { gaitConfigurationId: cfg.id, phaseNumber: 2, durationMs: 400, leftRotationSpeed: 60, leftRotationDirection: "FORWARD", rightRotationSpeed: 60, rightRotationDirection: "FORWARD" },
    { gaitConfigurationId: cfg.id, phaseNumber: 3, durationMs: 400, leftRotationSpeed: 60, leftRotationDirection: "FORWARD", rightRotationSpeed: 60, rightRotationDirection: "FORWARD" },
    { gaitConfigurationId: cfg.id, phaseNumber: 4, durationMs: 400, leftRotationSpeed: 60, leftRotationDirection: "FORWARD", rightRotationSpeed: 60, rightRotationDirection: "FORWARD" },
  ]);
}
