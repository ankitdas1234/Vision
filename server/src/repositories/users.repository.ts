import { db } from "../database/client";
import { users } from "../database/schema";
import { eq } from "drizzle-orm";

const PUBLIC_FIELDS = { id: users.id, name: users.name, email: users.email, role: users.role, isVerified: users.isVerified, isActive: users.isActive, createdAt: users.createdAt, updatedAt: users.updatedAt, lastLoginAt: users.lastLoginAt, avatarMediaId: users.avatarMediaId, personId: users.personId };

export const usersRepository = {
  async list() { return db.select(PUBLIC_FIELDS).from(users); },
  async findById(id: string) { const [row] = await db.select(PUBLIC_FIELDS).from(users).where(eq(users.id, id)); return row ?? null; },
  async updateRole(id: string, role: "ADMIN" | "TRUSTED" | "USER") {
    const [row] = await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id)).returning(PUBLIC_FIELDS);
    return row;
  },
  async updateStatus(id: string, isActive: boolean) {
    const [row] = await db.update(users).set({ isActive, updatedAt: new Date() }).where(eq(users.id, id)).returning(PUBLIC_FIELDS);
    return row;
  },
  /** Set (or clear, with `null`) the account's profile picture — see
   * routes/users.routes.ts POST/DELETE /users/me/avatar. */
  async setAvatar(id: string, avatarMediaId: string | null) {
    const [row] = await db.update(users).set({ avatarMediaId, updatedAt: new Date() }).where(eq(users.id, id)).returning(PUBLIC_FIELDS);
    return row ?? null;
  },
  /** Links this login account to a `people` row — see
   * auth/FaceLinking.ts for how that person is chosen (matched against
   * an existing face, or created fresh). One-way only: there's no
   * "unlink" route, since undoing it would just orphan the very history
   * (visits, learned facts) the link exists to surface. */
  async linkToPerson(id: string, personId: string) {
    const [row] = await db.update(users).set({ personId, updatedAt: new Date() }).where(eq(users.id, id)).returning(PUBLIC_FIELDS);
    return row ?? null;
  },
};
