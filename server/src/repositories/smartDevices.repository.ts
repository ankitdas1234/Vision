import { db } from "../database/client";
import { smartDevices } from "../database/schema";
import { eq, ilike } from "drizzle-orm";

export const smartDevicesRepository = {
  async list() {
    return db.select().from(smartDevices);
  },
  async findByName(name: string) {
    const [row] = await db.select().from(smartDevices).where(ilike(smartDevices.name, name));
    return row ?? null;
  },
  async create(input: typeof smartDevices.$inferInsert) {
    const [row] = await db.insert(smartDevices).values(input).returning();
    return row;
  },
  async delete(id: string) {
    await db.delete(smartDevices).where(eq(smartDevices.id, id));
  },
};
