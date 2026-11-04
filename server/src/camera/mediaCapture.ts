import { storeMedia } from "./mediaStorage";
import { visionStats } from "./visionStats";
import { logger } from "../logging/Logger";
import { robotRepository } from "../repositories/robot.repository";
import { visionFrameEventsRepository } from "../repositories/visionFrameEvents.repository";
import type { FrameQuality } from "./imageProcessor";
import type { MotionResult } from "../perception/motionDetection";

export interface MediaCaptureOutcome {
  stored: boolean;
  mediaId: string | null;
  googleDriveFileId: string | null;
  googleDriveUrl: string | null;
}

/**
 * Given a frame's already-computed quality + motion result (see
 * brain/observationProcessor.ts — this deliberately does NOT re-run
 * analyzeFrame/motion detection itself, since that state is per-robot and
 * stateful; calling it twice per capture would corrupt the motion
 * detector's background model), decides whether to actually persist the
 * image and does so. This is the single place storage happens — both
 * CameraService and BrainOrchestrator go through here so there's exactly
 * one "was this frame worth keeping" decision per capture, not two.
 */
export async function decideAndStoreMedia(
  buffer: Buffer,
  robotId: string,
  quality: FrameQuality,
  motion: MotionResult,
): Promise<MediaCaptureOutcome> {
  const recordFrameEvent = (
    outcome: "STORED" | "DISCARDED" | "SKIPPED_NO_CHANGE",
    fields: { motionDetected?: boolean } = {},
  ) => {
    void (async () => {
      try {
        const robot = await robotRepository.findByCode(robotId);
        await visionFrameEventsRepository.record({
          robotId: robot?.id ?? null,
          outcome,
          discardReason: quality.discardReason,
          meanBrightness: quality.meanBrightness,
          contrast: quality.contrast,
          sharpness: quality.sharpness,
          motionDetected: fields.motionDetected ?? null,
        });
      } catch (err) {
        logger.debug("Could not record vision frame event (non-fatal)", { error: (err as Error).message });
      }
    })();
  };

  if (!quality.isUsable) {
    visionStats.recordDiscarded(quality.discardReason!);
    recordFrameEvent("DISCARDED");
    logger.debug("Discarded unusable camera frame", { robotId, reason: quality.discardReason });
    return { stored: false, mediaId: null, googleDriveFileId: null, googleDriveUrl: null };
  }

  const worthKeeping = motion.isInitializing || motion.present;
  if (!worthKeeping) {
    visionStats.recordSkippedNoChange();
    recordFrameEvent("SKIPPED_NO_CHANGE", { motionDetected: false });
    return { stored: false, mediaId: null, googleDriveFileId: null, googleDriveUrl: null };
  }

  const robot = await robotRepository.findByCode(robotId).catch(() => null);
  const media = await storeMedia(buffer, `${robotId}-${Date.now()}.jpg`, {
    robotId: robot?.id ?? null,
    checksum: quality.checksum,
  });
  visionStats.recordStored();
  recordFrameEvent("STORED", { motionDetected: motion.present });

  return { stored: media.stored, mediaId: media.mediaId, googleDriveFileId: media.googleDriveFileId, googleDriveUrl: media.googleDriveUrl };
}
