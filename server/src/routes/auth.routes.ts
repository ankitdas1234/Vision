import { Router } from "express";
import { z } from "zod";
import { authService, AuthError } from "../auth/AuthService";
import { requireAuth, type AuthedRequest, SESSION_COOKIE_NAME } from "../middleware/auth";
import { validateBody } from "../middleware/validation";
import { loginRateLimit, accountRateLimit } from "../middleware/rateLimit";
import { mediaFilesRepository } from "../repositories/mediaFiles.repository";
import { env } from "../config/env";

/** Resolves a user's `avatarMediaId` into a directly-usable `avatarUrl`
 * (or null) so the dashboard never has to make a second round-trip just
 * to render the topbar avatar it gets from /auth/me. */
async function withAvatarUrl<T extends { avatarMediaId?: string | null }>(user: T) {
  const avatarUrl = user.avatarMediaId ? (await mediaFilesRepository.findById(user.avatarMediaId))?.googleDriveUrl ?? null : null;
  return { ...user, avatarUrl };
}

export const authRouter = Router();

const isProd = process.env.NODE_ENV === "production";
// SameSite=None is only accepted by browsers together with Secure, so it forces Secure on.
const cookieOptions = {
  httpOnly: true,
  secure: isProd || env.COOKIE_SAMESITE === "none",
  sameSite: env.COOKIE_SAMESITE,
  path: "/",
};

const RegisterSchema = z.object({ name: z.string().min(1).max(128), email: z.string().email(), password: z.string().min(8).max(256), imageBase64: z.string().optional() });
const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(1), remember: z.boolean().optional() });
const ForgotSchema = z.object({ email: z.string().email() });
const ResetSchema = z.object({ token: z.string().min(1), password: z.string().min(8).max(256) });
const VerifySchema = z.object({ token: z.string().min(1) });

authRouter.post("/auth/register", accountRateLimit, validateBody(RegisterSchema), async (req, res) => {
  try {
    // `linked`/`matchedExisting` let the dashboard say something honest
    // and human — "Welcome back!" vs "Nice to meet you!" — instead of
    // silently doing the identity linking with no acknowledgement. See
    // auth/FaceLinking.ts and docs/people.md.
    const { user, linked, matchedExisting } = await authService.register(req.body);
    res.status(201).json({ user, linked, matchedExisting });
  } catch (err) {
    const e = err as AuthError;
    res.status(400).json({ code: e.code ?? "REGISTRATION_FAILED", message: e.message });
  }
});

authRouter.post("/auth/login", loginRateLimit, validateBody(LoginSchema), async (req, res) => {
  try {
    const { session, user } = await authService.login({ ...req.body, ipAddress: req.ip, userAgent: req.headers["user-agent"] });
    // Remember me -> persistent cookie (30 days). Otherwise a browser-session cookie (no expiry attribute).
    res.cookie(SESSION_COOKIE_NAME, session.token, req.body.remember ? { ...cookieOptions, expires: session.expiresAt } : cookieOptions);
    res.json({ user: await withAvatarUrl(user), token: session.token, expiresAt: session.expiresAt }); // token also returned for non-cookie (e.g. mobile) clients
  } catch (err) {
    const e = err as AuthError;
    res.status(401).json({ code: e.code ?? "INVALID_CREDENTIALS", message: e.message });
  }
});

authRouter.post("/auth/logout", requireAuth, async (req: AuthedRequest, res) => {
  const token = req.cookies?.[SESSION_COOKIE_NAME] ?? req.headers.authorization?.slice(7);
  if (token) await authService.logout(token, req.user?.id);
  res.clearCookie(SESSION_COOKIE_NAME, cookieOptions);
  res.json({ success: true });
});

authRouter.get("/auth/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await authService.me(req.user!.id);
  if (!user) return res.status(404).json({ code: "NOT_FOUND", message: "User not found" });
  res.json({ user: await withAvatarUrl(user) });
});

authRouter.post("/auth/refresh", requireAuth, async (req: AuthedRequest, res) => {
  // Session verification already happened in requireAuth; simply confirm liveness.
  res.json({ user: req.user });
});

authRouter.post("/auth/forgot-password", accountRateLimit, validateBody(ForgotSchema), async (req, res) => {
  await authService.requestPasswordReset(req.body.email);
  // Always return the same generic response — never reveal whether the email exists.
  res.json({ success: true, message: "If that account exists, a reset link has been sent." });
});

authRouter.post("/auth/reset-password", accountRateLimit, validateBody(ResetSchema), async (req, res) => {
  try {
    await authService.resetPassword(req.body.token, req.body.password);
    res.json({ success: true });
  } catch (err) {
    const e = err as AuthError;
    res.status(400).json({ code: e.code ?? "RESET_FAILED", message: e.message });
  }
});

authRouter.post("/auth/verify", accountRateLimit, validateBody(VerifySchema), async (req, res) => {
  try {
    await authService.verifyAccount(req.body.token);
    res.json({ success: true });
  } catch (err) {
    const e = err as AuthError;
    res.status(400).json({ code: e.code ?? "VERIFICATION_FAILED", message: e.message });
  }
});
