import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env";
import { logger } from "../logging/Logger";

/**
 * Transactional email (password reset). Uses plain SMTP so any provider
 * works (Gmail app password, Brevo, Mailgun, SES SMTP, Resend SMTP, ...).
 *
 * If SMTP isn't configured:
 *  - development/test: the reset link is logged so you can still click it.
 *  - production: nothing secret is logged; an error is logged and the
 *    caller still returns the same generic response to the client.
 */
let transporter: Transporter | null = null;

export function isEmailConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.EMAIL_FROM);
}

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE, // true for 465, false for 587 (STARTTLS)
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } : undefined,
    });
  }
  return transporter;
}

export function buildPasswordResetLink(token: string): string {
  const base = env.FRONTEND_URL.replace(/\/+$/, "");
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

export const emailService = {
  async sendPasswordReset(to: string, name: string | null, token: string): Promise<boolean> {
    const link = buildPasswordResetLink(token);

    if (!isEmailConfigured()) {
      if (env.isProd) {
        logger.error("Password reset requested but SMTP is not configured (set SMTP_HOST and EMAIL_FROM) — email NOT sent");
      } else {
        logger.warn("SMTP not configured — dev fallback: password reset link below", { to, link });
      }
      return false;
    }

    try {
      await getTransporter().sendMail({
        from: env.EMAIL_FROM,
        to,
        subject: "Reset your Vision password",
        text:
          `Hi${name ? ` ${name}` : ""},\n\n` +
          `Use this link to reset your Vision password. It expires in 1 hour and works once:\n\n${link}\n\n` +
          `If you didn't ask for this, ignore this email — your password stays the same.`,
        html:
          `<p>Hi${name ? ` ${name}` : ""},</p>` +
          `<p>Use the button below to reset your Vision password. The link expires in 1 hour and works once.</p>` +
          `<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none">Reset password</a></p>` +
          `<p style="color:#666;font-size:12px">Or paste this into your browser:<br>${link}</p>` +
          `<p style="color:#666;font-size:12px">If you didn't ask for this, ignore this email.</p>`,
      });
      return true;
    } catch (err) {
      logger.error("Failed to send password reset email", { error: (err as Error).message });
      return false;
    }
  },
};
