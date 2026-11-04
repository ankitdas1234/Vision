import { logger } from "./Logger";

export function auditLog(action: string, actor: string, details?: Record<string, unknown>) {
  logger.info(`AUDIT: ${action}`, { actor, ...details });
}
