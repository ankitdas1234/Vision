import rateLimit from "express-rate-limit";

export const commandRateLimit = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });
export const aiRateLimit = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
export const loginRateLimit = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
// Registration and password-reset requests are cheap to spam (no credential
// to get wrong, unlike login) and each one sends an email or creates a row,
// so they get their own limit rather than reusing loginRateLimit's window.
export const accountRateLimit = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
