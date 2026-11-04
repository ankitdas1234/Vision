import { eq } from "drizzle-orm";
import { db } from "../database/client";
import { users } from "../database/schema";
import { passwordService } from "./PasswordService";
import { sessionService, REMEMBER_TTL_MS, SHORT_TTL_MS, type SessionUser } from "./SessionService";
import { generateToken, hashToken } from "./tokens";
import { audit } from "./AuditService";
import { matchOrCreatePersonForFace } from "./FaceLinking";
import { logger } from "../logging/Logger";
import { emailService } from "./EmailService";

export class AuthError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export interface RegisterInput { name: string; email: string; password: string; imageBase64?: string }
export interface LoginInput { email: string; password: string; remember?: boolean; ipAddress?: string; userAgent?: string }

const PUBLIC_USER_FIELDS = { id: users.id, name: users.name, email: users.email, role: users.role, isVerified: users.isVerified, isActive: users.isActive, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt, avatarMediaId: users.avatarMediaId, personId: users.personId };

export const authService = {
  async register(input: RegisterInput) {
    const existing = await db.select().from(users).where(eq(users.email, input.email.toLowerCase()));
    if (existing.length > 0) {
      // Same generic error as any other failure — never reveal whether an email exists.
      throw new AuthError("REGISTRATION_FAILED", "Unable to register with the provided details");
    }

    // Webcam capture at signup (see docs/people.md "One identity, however
    // you first met"): if this person already has a face on record from
    // meeting Vision in person, THAT existing `people` row is reused —
    // no duplicate identity — and this capture becomes one more
    // reference photo on it. If not, a fresh `people` row is created
    // right here, same as Vision auto-registering a stranger on first
    // sight. Deliberately never blocks registration: no camera access,
    // no face detected, or a too-low-quality frame all just leave the
    // account unlinked (personId null) rather than failing signup — see
    // FaceLinking.ts for exactly what each outcome means. A truly
    // unexpected error (e.g. the ML backend crashing) is caught and
    // logged rather than allowed to take down account creation over
    // what is, from the person's perspective, an optional step.
    let personId: string | null = null;
    let matchedExisting = false;
    if (input.imageBase64) {
      try {
        const result = await matchOrCreatePersonForFace(input.imageBase64, input.name);
        if (result.status === "LINKED") {
          personId = result.personId;
          matchedExisting = result.matchedExisting;
        }
      } catch (err) {
        logger.warn("Face linking failed during registration (non-fatal, account created unlinked)", { error: (err as Error).message });
      }
    }

    const passwordHash = await passwordService.hash(input.password);
    const [user] = await db.insert(users).values({
      name: input.name, email: input.email.toLowerCase(), passwordHash, role: "USER", isVerified: false, isActive: true, personId,
    }).returning(PUBLIC_USER_FIELDS);

    await audit("REGISTER", { userId: user.id, metadata: { linked: !!personId, matchedExisting } });
    return { user, linked: !!personId, matchedExisting };
  },

  async login(input: LoginInput) {
    const [user] = await db.select().from(users).where(eq(users.email, input.email.toLowerCase()));
    // Constant-shape failure path — don't leak whether the email exists.
    const genericError = () => new AuthError("INVALID_CREDENTIALS", "Invalid email or password");

    if (!user) { await audit("LOGIN_FAILED", { metadata: { email: input.email } }); throw genericError(); }

    const validPassword = await passwordService.compare(input.password, user.passwordHash);
    if (!validPassword) { await audit("LOGIN_FAILED", { userId: user.id }); throw genericError(); }

    if (!user.isActive) { await audit("LOGIN_FAILED", { userId: user.id, metadata: { reason: "INACTIVE" } }); throw new AuthError("ACCOUNT_DISABLED", "This account has been deactivated"); }

    const sessionUser: SessionUser = { id: user.id, email: user.email, role: user.role as SessionUser["role"] };
    const session = await sessionService.issue(sessionUser, { userAgent: input.userAgent, ipAddress: input.ipAddress, ttlMs: input.remember === undefined ? undefined : input.remember ? REMEMBER_TTL_MS : SHORT_TTL_MS });

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await audit("LOGIN_SUCCESS", { userId: user.id, ipAddress: input.ipAddress });

    return { session, user: { id: user.id, name: user.name, email: user.email, role: user.role, isVerified: user.isVerified, avatarMediaId: user.avatarMediaId, personId: user.personId } };
  },

  async logout(token: string, userId?: string) {
    await sessionService.revoke(token);
    await audit("LOGOUT", { userId });
  },

  async me(userId: string) {
    const [user] = await db.select(PUBLIC_USER_FIELDS).from(users).where(eq(users.id, userId));
    return user ?? null;
  },

  async requestPasswordReset(email: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    if (!user) return; // never reveal existence
    const { token, tokenHash } = generateToken();
    const { passwordResetTokens } = await import("../database/schema");
    await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
    // Email failures are logged inside emailService and never surfaced to the
    // caller — the route must return the same generic response either way so
    // it can't be used to probe which emails have accounts.
    await emailService.sendPasswordReset(user.email, user.name ?? null, token);
  },

  async resetPassword(token: string, newPassword: string) {
    const { passwordResetTokens } = await import("../database/schema");
    const tokenHash = hashToken(token);
    const [record] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash));
    if (!record || record.usedAt || record.expiresAt < new Date()) throw new AuthError("INVALID_TOKEN", "Reset token is invalid or expired");

    const passwordHash = await passwordService.hash(newPassword);
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, record.userId));
    await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, record.id));
    // Kill every existing login — anyone holding an old/stolen session is signed out.
    await sessionService.revokeAllForUser(record.userId);
    await audit("PASSWORD_RESET", { userId: record.userId });
  },

  async verifyAccount(token: string) {
    const { verificationTokens } = await import("../database/schema");
    const tokenHash = hashToken(token);
    const [record] = await db.select().from(verificationTokens).where(eq(verificationTokens.tokenHash, tokenHash));
    if (!record || record.usedAt || record.expiresAt < new Date()) throw new AuthError("INVALID_TOKEN", "Verification token is invalid or expired");

    await db.update(users).set({ isVerified: true, updatedAt: new Date() }).where(eq(users.id, record.userId));
    await db.update(verificationTokens).set({ usedAt: new Date() }).where(eq(verificationTokens.id, record.id));
    await audit("ACCOUNT_VERIFIED", { userId: record.userId });
  },
};
