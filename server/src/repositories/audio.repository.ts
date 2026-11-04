import { db } from "../database/client";
import { audioFiles, speechTranscriptions, voiceInteractions } from "../database/schema";

export const audioRepository = {
  async recordAudioFile(input: typeof audioFiles.$inferInsert) { const [row] = await db.insert(audioFiles).values(input).returning(); return row; },
  async recordTranscription(input: typeof speechTranscriptions.$inferInsert) { const [row] = await db.insert(speechTranscriptions).values(input).returning(); return row; },
  async recordInteraction(input: typeof voiceInteractions.$inferInsert) { const [row] = await db.insert(voiceInteractions).values(input).returning(); return row; },
  async listInteractions() { return db.select().from(voiceInteractions); },
};
