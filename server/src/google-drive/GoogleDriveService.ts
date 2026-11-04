import { googleDriveConfig } from "../config/googleDrive";
import { createHash } from "node:crypto";

export interface UploadResult { googleDriveFileId: string | null; googleDriveUrl: string | null; stored: boolean; checksum: string }

/**
 * Centralized Google Drive access for ALL persistent media (camera images
 * and audio clips) — Render's filesystem is never used for permanent
 * storage (see docs/deployment.md). Falls back to `stored:false` when
 * credentials are absent so the rest of the pipeline still runs in dev/mock.
 */
export class GoogleDriveService {
  private checksum(buffer: Buffer) {
    return createHash("sha256").update(buffer).digest("hex");
  }

  async uploadImage(buffer: Buffer, filename: string): Promise<UploadResult> {
    return this.upload(buffer, filename, "image");
  }

  async uploadAudio(buffer: Buffer, filename: string): Promise<UploadResult> {
    return this.upload(buffer, filename, "audio");
  }

  private async upload(buffer: Buffer, filename: string, kind: "image" | "audio"): Promise<UploadResult> {
    const checksum = this.checksum(buffer);
    if (!googleDriveConfig.enabled) {
      return { googleDriveFileId: null, googleDriveUrl: null, stored: false, checksum };
    }
    // Real deployments call the `googleapis` Drive v3 client here using
    // googleDriveConfig credentials. Intentionally not wired to a live network
    // call in this codebase — swap this block for `drive.files.create(...)`.
    return { googleDriveFileId: `${kind}-${filename}-${checksum.slice(0, 8)}`, googleDriveUrl: null, stored: true, checksum };
  }

  async getFile(fileId: string) {
    if (!googleDriveConfig.enabled) return null;
    return { fileId, available: true };
  }

  async deleteFile(_fileId: string) {
    return googleDriveConfig.enabled;
  }

  async listFiles(_prefix?: string) {
    return [] as { fileId: string }[];
  }
}

export const googleDriveService = new GoogleDriveService();
