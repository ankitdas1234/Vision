import jwt from "jsonwebtoken";
import { db } from "../database/client";
import { sessions, users } from "../database/schema";
import { eq, and } from "drizzle-orm";
import { env } from "../config/env";
import { generateToken, hashToken } from "./tokens";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (default)
export const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000; // "Remember me"
export const SHORT_TTL_MS = 24 * 60 * 60 * 1000; // not remembered: 1 day, cookie dies with the browser
export type SessionUser = { id: string; email: string; role: "ADMIN" | "TRUSTED" | "USER" };

export interface IssuedSession {
  token: string; // JWT — sent to the client as an httpOnly cookie
  expiresAt: Date;
}

/**
 * Sessions are JWTs (fast, stateless verification) whose hash is also
 * persisted server-side, so logout / revocation actually works instead of
 * just expiring client-side. Every verify checks both signature AND the
 * DB record (revoked / expired).
 */
export const sessionService = {
  async issue(user: SessionUser, meta: { userAgent?: string; ipAddress?: string; ttlMs?: number }): Promise<IssuedSession> {
    const ttl = meta.ttlMs ?? SESSION_TTL_MS;
    const expiresAt = new Date(Date.now() + ttl);
    const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, env.JWT_SECRET, {
      expiresIn: Math.floor(ttl / 1000),
    });
    await db.insert(sessions).values({
      userId: user.id,
      tokenHash: hashToken(token),
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      expiresAt,
    });
    return { token, expiresAt };
  },

  async verify(token: string): Promise<SessionUser | null> {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; email: string; role: SessionUser["role"] };
      const tokenHash = hashToken(token);
      const [record] = await db.select().from(sessions).where(and(eq(sessions.tokenHash, tokenHash), eq(sessions.revoked, false)));
      if (!record) return null;
      if (record.expiresAt < new Date()) return null;
      // The role in the token is only what it was at login. Read the CURRENT role (and active flag) from the database,
      // so promoting a user to ADMIN works at once (no sign-out needed) and demoting or disabling someone takes effect immediately.
      const [current] = await db.select({ role: users.role, isActive: users.isActive }).from(users).where(eq(users.id, payload.sub));
      if (!current || !current.isActive) return null;
      return { id: payload.sub, email: payload.email, role: current.role as SessionUser["role"] };
    } catch {
      return null;
    }
  },

  async revoke(token: string) {
    const tokenHash = hashToken(token);
    await db.update(sessions).set({ revoked: true }).where(eq(sessions.tokenHash, tokenHash));
  },

  /** Revokes every active session for a user — used after a password reset
   * so a stolen/old session can't outlive the credential change. */
  async revokeAllForUser(userId: string) {
    await db.update(sessions).set({ revoked: true }).where(and(eq(sessions.userId, userId), eq(sessions.revoked, false)));
  },
};

export { generateToken };
