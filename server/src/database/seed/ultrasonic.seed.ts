import { eq } from "drizzle-orm";
import { db } from "../client";
import { ultrasonicConfigurations } from "../schema";

/** Seeds one default HC-SR04 threshold configuration matching the server's built-in defaults. */
export async function seedUltrasonic(robotId: string) {
  const [already] = await db.select({ id: ultrasonicConfigurations.id }).from(ultrasonicConfigurations).where(eq(ultrasonicConfigurations.robotId, robotId)).limit(1);
  if (already) return; // keep whatever thresholds are already configured
  await db.insert(ultrasonicConfigurations).values({
    robotId, safeDistanceMm: 600, warningDistanceMm: 300, stopDistanceMm: 150, emergencyDistanceMm: 50, filterWindow: 5, enabled: true,
  });
}
