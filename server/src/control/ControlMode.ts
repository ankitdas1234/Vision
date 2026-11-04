import { eq } from "drizzle-orm";
import { db } from "../database/client";
import { systemSettings } from "../database/schema";

const SETTING_KEY = "manual_mode_enabled";

export class ControlModeError extends Error {
  code = "AUTONOMOUS_MODE_ACTIVE";
}

/**
 * Single system-wide switch arbitrating who is allowed to physically move
 * the robot: the brain (autonomous, default) or a human (manual).
 *
 *   MANUAL (enabled=true)    -> dashboard buttons + Vision Script may
 *                                dispatch movement commands. The brain still
 *                                perceives/decides every cycle (visible on
 *                                the Brain/Decisions/Reactions dashboard
 *                                pages) but does NOT act on its own
 *                                decisions, so it never fights a human for
 *                                the same servos.
 *   AUTONOMOUS (enabled=false, the default) -> the brain drives. Direct
 *                                movement commands from a human are
 *                                rejected with a clear reason.
 *
 * EMERGENCY_STOP and SERVOS_SAFE are never gated by this — see
 * MANUAL_GATED_COMMANDS in ../packages/commands.
 */
class ControlModeService {
  private cachedEnabled: boolean | null = null;

  async isManualModeEnabled(): Promise<boolean> {
    if (this.cachedEnabled !== null) return this.cachedEnabled;
    try {
      const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, SETTING_KEY));
      this.cachedEnabled = row ? Boolean(row.value) : false; // default: AUTONOMOUS
      return this.cachedEnabled;
    } catch {
      // DB unreachable/settings table hiccup — fail safe to AUTONOMOUS for
      // this call, but don't cache the failure so the next call retries the
      // DB rather than getting stuck on a transient outage forever.
      return false;
    }
  }

  async setManualModeEnabled(enabled: boolean): Promise<boolean> {
    await db
      .insert(systemSettings)
      .values({ key: SETTING_KEY, value: enabled, updatedAt: new Date() })
      .onConflictDoUpdate({ target: systemSettings.key, set: { value: enabled, updatedAt: new Date() } });
    this.cachedEnabled = enabled;
    return enabled;
  }

  async mode(): Promise<"MANUAL" | "AUTONOMOUS"> {
    return (await this.isManualModeEnabled()) ? "MANUAL" : "AUTONOMOUS";
  }
}

export const controlMode = new ControlModeService();
