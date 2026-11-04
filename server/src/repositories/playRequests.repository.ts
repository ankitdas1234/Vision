import { db } from "../database/client";
import { playRequests } from "../database/schema";
import { eq } from "drizzle-orm";

export interface ConversationTurn {
  question: string;
  answer: string | null;
  askedAt: string;
}

export interface PlayRequestRow {
  id: string;
  personId: string | null;
  robotId: string | null;
  requestedText: string;
  status: "SEARCHING" | "FOUND" | "NOT_FOUND" | "PLAYED";
  matchedTrackId: string | null;
  conversationLog: ConversationTurn[];
  createdAt: Date;
  updatedAt: Date;
}

export const playRequestsRepository = {
  async create(input: { personId?: string | null; robotId?: string | null; requestedText: string }): Promise<PlayRequestRow> {
    const [row] = await db
      .insert(playRequests)
      .values({ personId: input.personId ?? null, robotId: input.robotId ?? null, requestedText: input.requestedText, conversationLog: [] })
      .returning();
    return row as PlayRequestRow;
  },

  async findById(id: string): Promise<PlayRequestRow | null> {
    const [row] = await db.select().from(playRequests).where(eq(playRequests.id, id));
    return (row as PlayRequestRow) ?? null;
  },

  async updateStatus(id: string, status: PlayRequestRow["status"], matchedTrackId?: string | null): Promise<void> {
    await db
      .update(playRequests)
      .set({ status, matchedTrackId: matchedTrackId ?? undefined, updatedAt: new Date() })
      .where(eq(playRequests.id, id));
  },

  async appendConversationTurn(id: string, turn: ConversationTurn): Promise<void> {
    const existing = await this.findById(id);
    const log = existing?.conversationLog ?? [];
    await db
      .update(playRequests)
      .set({ conversationLog: [...log, turn], updatedAt: new Date() })
      .where(eq(playRequests.id, id));
  },

  /** Appends an answer to the most recent turn that doesn't have one yet
   * — the normal case, since a question is logged when asked and its
   * answer arrives afterward via a separate transcript. */
  async recordAnswerForLatestTurn(id: string, answer: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing || existing.conversationLog.length === 0) return;
    const log = [...existing.conversationLog];
    const lastIdx = log.length - 1;
    if (log[lastIdx].answer === null) {
      log[lastIdx] = { ...log[lastIdx], answer };
      await db.update(playRequests).set({ conversationLog: log, updatedAt: new Date() }).where(eq(playRequests.id, id));
    }
  },

  async listForPerson(personId: string): Promise<PlayRequestRow[]> {
    return db.select().from(playRequests).where(eq(playRequests.personId, personId)) as unknown as Promise<PlayRequestRow[]>;
  },

  /** "What's Ram's favorite song?" — the real track requested most often
   * by this person, from their actual play_requests history. Only counts
   * requests that actually matched a real track (FOUND/PLAYED), not
   * every raw thing they asked for. Returns null if they've never had a
   * successful request. */
  async favoriteTrackForPerson(personId: string): Promise<{ trackId: string; requestCount: number } | null> {
    const rows = await this.listForPerson(personId);
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (!row.matchedTrackId) continue;
      counts.set(row.matchedTrackId, (counts.get(row.matchedTrackId) ?? 0) + 1);
    }
    if (counts.size === 0) return null;

    let bestTrackId = "";
    let bestCount = 0;
    for (const [trackId, count] of counts) {
      if (count > bestCount) {
        bestTrackId = trackId;
        bestCount = count;
      }
    }
    return { trackId: bestTrackId, requestCount: bestCount };
  },
};
