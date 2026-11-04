import { db } from "../client";
import { systemSettings } from "../schema";

/** Explicitly seeds the default control mode (AUTONOMOUS — the brain drives) so it's visible in a fresh DB rather than relying on the code-level fallback. */
export async function seedControlMode() {
  await db.insert(systemSettings).values({ key: "manual_mode_enabled", value: false }).onConflictDoNothing({ target: systemSettings.key }); // keeps whatever an admin already chose
}
