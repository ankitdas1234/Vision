import type { Request, Response, NextFunction } from "express";
import type { ZodTypeAny } from "zod";

export function validateBody(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ code: "SCHEMA_VALIDATION_FAILED", message: parsed.error.message });
    }
    req.body = parsed.data;
    next();
  };
}
