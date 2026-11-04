import bcrypt from "bcryptjs";
import { db } from "../client";
import { users } from "../schema";

/**
 * Optional local-dev login only. There is intentionally no hardcoded
 * credential here anymore — a fixed admin email/password checked into the
 * repo is a standing security risk (it ends up in every clone, every fork,
 * every screenshot of this file).
 *
 * Real admin accounts (all 6) are provisioned straight into Neon via
 * `node scripts/create-admin.js` — see database/README.md#admin-accounts.
 * That path never touches this seed script or version control.
 *
 * To get a throwaway ADMIN login for local development only, set both env
 * vars before running `npm run seed`:
 *   DEV_SEED_ADMIN_EMAIL=you@example.com
 *   DEV_SEED_ADMIN_PASSWORD=<any password meeting the 8-char minimum>
 * If either is unset, this step is skipped — no default account is created.
 */
export async function seedUsers() {
  const email = process.env.DEV_SEED_ADMIN_EMAIL;
  const password = process.env.DEV_SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    // eslint-disable-next-line no-console
    console.log(
      "seedUsers: skipped (no DEV_SEED_ADMIN_EMAIL/DEV_SEED_ADMIN_PASSWORD set). " +
      "For real admin accounts use `node scripts/create-admin.js` instead."
    );
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db.insert(users).values({
    name: "Dev Admin", email: email.toLowerCase(), passwordHash, role: "ADMIN", isVerified: true, isActive: true,
  }).onConflictDoNothing({ target: users.email });

  // eslint-disable-next-line no-console
  console.log(`seedUsers: dev admin ready — ${email.toLowerCase()} (local/dev only, never for production)`);
}
