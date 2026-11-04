import type { Response, NextFunction } from "express";
import type { AuthedRequest } from "./auth";

/** ADMIN > TRUSTED > USER. requireRole(...) allows any listed role or higher via ROLE_RANK. */
const ROLE_RANK: Record<string, number> = { USER: 0, TRUSTED: 1, ADMIN: 2 };

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN") return res.status(403).json({ code: "PERMISSION_DENIED", message: "Admin permission required" });
  next();
}

/** Requires the authenticated user's role to be at least `minRole` in the ADMIN > TRUSTED > USER hierarchy. */
export function requireRole(minRole: "USER" | "TRUSTED" | "ADMIN") {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const rank = req.user ? ROLE_RANK[req.user.role] : -1;
    if (rank < ROLE_RANK[minRole]) {
      return res.status(403).json({ code: "PERMISSION_DENIED", message: `Requires ${minRole} permission or higher` });
    }
    next();
  };
}
