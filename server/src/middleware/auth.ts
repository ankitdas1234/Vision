import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { sessionService, type SessionUser } from "../auth/SessionService";
import { env } from "../config/env";

export const SESSION_COOKIE_NAME = "pi_session";

export interface AuthedRequest extends Request {
  user?: SessionUser;
}

function extractToken(req: Request): string | null {
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE_NAME];
  if (cookieToken) return cookieToken;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}

/** Verifies the session (JWT signature + DB revocation/expiry check) and attaches req.user. */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ code: "UNAUTHENTICATED", message: "Login required" });

  const user = await sessionService.verify(token);
  if (!user) return res.status(401).json({ code: "UNAUTHENTICATED", message: "Session is invalid or has expired" });

  req.user = user;
  next();
}

/** Attaches req.user if a valid session is present, but never blocks the request. */
export async function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (token) req.user = (await sessionService.verify(token)) ?? undefined;
  next();
}

/** Constant-time string compare — `!==` on a static secret leaks how many
 * leading bytes matched via response-timing, letting an attacker recover
 * the secret byte-by-byte over enough requests. Low-value target here, but
 * costs nothing to close. */
function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function requireRobotAuth(req: Request, res: Response, next: NextFunction) {
  const secret = req.headers["x-robot-secret"];
  if (typeof secret !== "string" || !secretsMatch(secret, env.ROBOT_AUTH_SECRET)) {
    return res.status(401).json({ code: "UNAUTHENTICATED", message: "Invalid robot secret" });
  }
  next();
}

