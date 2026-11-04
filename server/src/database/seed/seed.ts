import { and, eq } from "drizzle-orm";
import { db } from "../client";
import { robots, people } from "../schema";
import { seedServos } from "./servo.seed";
import { seedGait } from "./gait.seed";
import { seedStaticMemory } from "./static-memory.seed";
import { seedUsers } from "./users.seed";
import { seedUltrasonic } from "./ultrasonic.seed";
import { seedControlMode } from "./control-mode.seed";

/** Development-only seed. Uses fake identities — never real personal data. */
async function main() {
  // Safe to run more than once, and safe to run AFTER the server has already started
  // (the server creates the robot row itself on first boot, which used to make this crash
  // with a duplicate robot_code and skip every seed below it).
  const [robot] = await db.insert(robots).values({
    robotCode: "vision-001", name: "Vision", firmwareVersion: "1.0.0", hardwareVersion: "esp32cam-pca9685-4servo", status: "OFFLINE",
  }).onConflictDoUpdate({ target: robots.robotCode, set: { name: "Vision", updatedAt: new Date() } }).returning();

  const [existingAdmin] = await db.select({ id: people.id }).from(people).where(and(eq(people.name, "Dev Admin"), eq(people.category, "ADMIN"))).limit(1);
  if (!existingAdmin) {
    await db.insert(people).values({
      name: "Dev Admin", category: "ADMIN", trustScore: 1, relationshipScore: 1, metadata: { seedOnly: true },
    });
  }

  await seedServos(robot.id);
  await seedGait(robot.id);
  await seedStaticMemory();
  await seedUsers();
  await seedUltrasonic(robot.id);
  await seedControlMode();

  // eslint-disable-next-line no-console
  console.log("Seed complete for robot:", robot.robotCode);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
