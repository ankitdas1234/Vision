import { eq } from "drizzle-orm";
import { db } from "../client";
import { servoConfigurations } from "../schema";

/**
 * Seeds exactly 3 servo records matching the authoritative hardware map
 * (servos/ServoConfiguration.ts): head (CH0, positional 0-180°, carries the
 * camera + ultrasonic), left leg (CH1) and right leg (CH2), both continuous.
 */
export async function seedServos(robotId: string) {
  // Re-running the seed must not create duplicate servo rows.
  const existing = await db.select({ servoId: servoConfigurations.servoId }).from(servoConfigurations).where(eq(servoConfigurations.robotId, robotId));
  const have = new Set(existing.map((r) => r.servoId));
  const rows = [
    { robotId, servoId: "head", name: "Head", channel: 0, servoType: "POSITIONAL", purpose: "HEAD", minAngle: 0, maxAngle: 180, centerAngle: 90, directionInverted: false },
    { robotId, servoId: "left-leg", name: "Left Leg", channel: 1, servoType: "CONTINUOUS", purpose: "LEFT_LEG", neutralPwm: 307, minPwm: 205, maxPwm: 409, defaultSpeed: 50, directionInverted: false },
    { robotId, servoId: "right-leg", name: "Right Leg", channel: 2, servoType: "CONTINUOUS", purpose: "RIGHT_LEG", neutralPwm: 307, minPwm: 205, maxPwm: 409, defaultSpeed: 50, directionInverted: false },
  ].filter((r) => !have.has(r.servoId));
  if (rows.length) await db.insert(servoConfigurations).values(rows);
}
