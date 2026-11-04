import { eq } from "drizzle-orm";
import { db } from "../database/client";
import { systemSettings } from "../database/schema";

const SETTING_KEY = "compiler_enabled";

export class CompilerDisabledError extends Error {
  code = "COMPILER_DISABLED";
}

/**
 * Admin-only kill switch for the Vision Script compiler/executor — separate
 * from, and independent of, Control Mode (`ControlMode.ts`).
 *
 * Control Mode answers "who is allowed to move the robot right now" (brain
 * vs. a human) and only gates EXECUTION — compiling (a pure dry-run: source
 * -> AST -> IR, no hardware touched) is always allowed regardless of mode,
 * so a script can be prepared ahead of switching to Manual Mode.
 *
 * This switch answers a different question: "is the compiler/terminal
 * feature allowed to be used AT ALL, by anyone, right now." When an admin
 * turns it off, BOTH compiling and executing are rejected server-side, for
 * every caller (including the dashboard's own terminal widget) — an
 * emergency "shut the whole feature off" that doesn't require also flipping
 * Control Mode (which would additionally block direct dashboard movement
 * buttons, a separate concern).
 *
 * Enabled by default — this is a kill switch for incident response, not a
 * feature flag that starts locked down.
 */
class CompilerSettingsService {
  private cachedEnabled: boolean | null = null;

  async isEnabled(): Promise<boolean> {
    if (this.cachedEnabled !== null) return this.cachedEnabled;
    try {
      const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, SETTING_KEY));
      this.cachedEnabled = row ? Boolean(row.value) : true; // default: ENABLED
      return this.cachedEnabled;
    } catch {
      // DB unreachable/settings table hiccup — fail OPEN (enabled) for this
      // call rather than silently bricking the compiler on a transient
      // outage, but don't cache the failure so the next call retries the DB.
      return true;
    }
  }

  async setEnabled(enabled: boolean): Promise<boolean> {
    await db
      .insert(systemSettings)
      .values({ key: SETTING_KEY, value: enabled, updatedAt: new Date() })
      .onConflictDoUpdate({ target: systemSettings.key, set: { value: enabled, updatedAt: new Date() } });
    this.cachedEnabled = enabled;
    return enabled;
  }
}

export const compilerSettings = new CompilerSettingsService();
