import { db } from "../database/client";
import { auditLogs } from "../database/schema";
import { logger } from "../logging/Logger";

export type AuditEvent =
  | "LOGIN_SUCCESS" | "LOGIN_FAILED" | "LOGOUT" | "REGISTER"
  | "ACCOUNT_VERIFIED" | "ACCOUNT_DISABLED" | "ROLE_CHANGED"
  | "PASSWORD_CHANGED" | "PASSWORD_RESET" | "PRIVILEGED_COMMAND" | "EMERGENCY_STOP"
  | "SYSTEM_SETTING_CHANGED";

/** Persists security-relevant events. Never throws — a logging failure must not break the request. */
export async function audit(event: AuditEvent, opts: { userId?: string; ipAddress?: string; metadata?: Record<string, unknown> } = {}) {
  try {
    await db.insert(auditLogs).values({ event, userId: opts.userId, ipAddress: opts.ipAddress, metadata: opts.metadata });
  } catch (err) {
    logger.warn("audit log write failed", { event, error: (err as Error).message });
  }
}
