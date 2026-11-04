import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { logger } from "../logging/Logger";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const e = err as { code?: string; message: string; status?: number };
  logger.error("Unhandled error", { message: e.message, code: e.code });
  res.status(e.status ?? 500).json({
    code: e.code ?? "INTERNAL_ERROR",
    message: e.message ?? "Unexpected error",
    ...(env.isProd ? {} : { stackHidden: true }),
  });
}
