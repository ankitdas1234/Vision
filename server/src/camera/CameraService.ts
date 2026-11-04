import { brainOrchestrator } from "../brain/BrainOrchestrator";
import type { FrameDiscardReason } from "./imageProcessor";
import type { NormalizedBox } from "../perception/motionDetection";

export interface CaptureResult {
  [key: string]: unknown;
  width: number;
  height: number;
  checksum: string;
  capturedAt: string;
  stored: boolean;
  discarded: boolean;
  discardReason: FrameDiscardReason | null;
  skippedReason: "NO_CHANGE" | null;
  googleDriveFileId: string | null;
  googleDriveUrl: string | null;
  quality?: { meanBrightness: number; contrast: number; sharpness: number };
  motion?: { present: boolean; magnitude: number; roi: NormalizedBox | null };
}

/**
 * POST /api/camera/capture is the one place the ESP32-S3 sends a frame —
 * from here, the ENTIRE brain runs automatically: quality/motion gating,
 * detection, identity recognition (recall or register), memory, decision,
 * reaction, and person-encounter logging, all in one pass. Nothing else
 * needs to call the robot back or poll for anything; see
 * BrainOrchestrator.observeAndReact and docs/vision-pipeline.md.
 *
 * This class only exists to keep the existing /api/camera/* response shape
 * stable for anything (dashboard, tests) still expecting it — the real
 * pipeline lives in brain/BrainOrchestrator.ts and camera/mediaCapture.ts.
 */
export class CameraService {
  async capture(buffer: Buffer, robotId: string): Promise<CaptureResult> {
    const capturedAt = new Date().toISOString();
    const result = await brainOrchestrator.observeAndReact(buffer, robotId);
    const { perception, media } = result;

    return {
      width: perception.frameWidth,
      height: perception.frameHeight,
      checksum: perception.checksum,
      capturedAt,
      stored: media.stored,
      discarded: perception.frameDiscarded,
      discardReason: perception.discardReason,
      skippedReason: !perception.frameDiscarded && perception.detectionSkipped ? "NO_CHANGE" : null,
      googleDriveFileId: media.googleDriveFileId,
      googleDriveUrl: media.googleDriveUrl,
      quality: perception.frameDiscarded ? undefined : { meanBrightness: perception.meanBrightness, contrast: perception.contrast, sharpness: perception.sharpness },
      motion: perception.frameDiscarded ? undefined : { present: perception.motionDetected, magnitude: perception.motionMagnitude, roi: perception.motionRoi },
    };
  }
}

export const cameraService = new CameraService();
