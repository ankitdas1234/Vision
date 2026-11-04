import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn(async () => ({}));
  return { sendMail, createTransport: vi.fn(() => ({ sendMail })) };
});
vi.mock("nodemailer", () => ({ default: { createTransport } }));

describe("EmailService.sendPasswordReset", () => {
  beforeEach(() => { vi.resetModules(); sendMail.mockClear(); createTransport.mockClear(); });

  it("emails a reset link containing the token when SMTP is configured", async () => {
    vi.doMock("../../../src/config/env", () => ({
      env: { SMTP_HOST: "smtp.test", SMTP_PORT: 587, SMTP_SECURE: false, SMTP_USER: "u", SMTP_PASS: "p", EMAIL_FROM: "Vision <no-reply@test>", FRONTEND_URL: "https://app.test/", isProd: true },
    }));
    const { emailService } = await import("../../../src/auth/EmailService");
    const ok = await emailService.sendPasswordReset("sam@test.com", "Sam", "tok123");
    expect(ok).toBe(true);
    const mail = sendMail.mock.calls[0][0] as any;
    expect(mail.to).toBe("sam@test.com");
    expect(mail.text).toContain("https://app.test/reset-password?token=tok123");
    expect(mail.html).toContain("https://app.test/reset-password?token=tok123");
  });

  it("sends nothing (and does not throw) when SMTP is not configured", async () => {
    vi.doMock("../../../src/config/env", () => ({ env: { FRONTEND_URL: "http://localhost:5173", isProd: false } }));
    const { emailService } = await import("../../../src/auth/EmailService");
    expect(await emailService.sendPasswordReset("sam@test.com", null, "tok")).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("returns false instead of throwing if the SMTP provider errors", async () => {
    sendMail.mockRejectedValueOnce(new Error("smtp down"));
    vi.doMock("../../../src/config/env", () => ({ env: { SMTP_HOST: "h", SMTP_PORT: 587, SMTP_SECURE: false, EMAIL_FROM: "a@b", FRONTEND_URL: "http://x", isProd: true } }));
    const { emailService } = await import("../../../src/auth/EmailService");
    expect(await emailService.sendPasswordReset("a@b.c", null, "t")).toBe(false);
  });
});
