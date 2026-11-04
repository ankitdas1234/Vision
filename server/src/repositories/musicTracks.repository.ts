import { db } from "../database/client";
import { musicTracks } from "../database/schema";
import { eq } from "drizzle-orm";

export interface MusicTrackRow {
  id: string;
  title: string;
  uploadedByUserId: string | null;
  mediaId: string | null;
  durationMs: number;
  bpm: number;
  beatConfidence: number;
  beatTimestampsMs: number[];
  checksum: string | null;
  createdAt: Date;
}

export const musicTracksRepository = {
  async create(input: {
    title: string;
    uploadedByUserId?: string | null;
    mediaId?: string | null;
    durationMs: number;
    bpm: number;
    beatConfidence: number;
    beatTimestampsMs: number[];
    checksum?: string | null;
  }) {
    const [row] = await db
      .insert(musicTracks)
      .values({
        title: input.title,
        uploadedByUserId: input.uploadedByUserId ?? null,
        mediaId: input.mediaId ?? null,
        durationMs: input.durationMs,
        bpm: input.bpm,
        beatConfidence: input.beatConfidence,
        beatTimestampsMs: input.beatTimestampsMs,
        checksum: input.checksum ?? null,
      })
      .returning();
    return row as MusicTrackRow;
  },

  async findById(id: string): Promise<MusicTrackRow | null> {
    const [row] = await db.select().from(musicTracks).where(eq(musicTracks.id, id));
    return (row as MusicTrackRow) ?? null;
  },

  async list(): Promise<MusicTrackRow[]> {
    return db.select().from(musicTracks) as unknown as Promise<MusicTrackRow[]>;
  },
};
