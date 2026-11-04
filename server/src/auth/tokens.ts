import { randomBytes, createHash } from "node:crypto";

/** Generates a random opaque token + its stored hash. Only the hash is persisted. */
export function generateToken() {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
