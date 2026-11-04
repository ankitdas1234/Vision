import type { FrameDiscardReason } from "./imageProcessor";

/**
 * Answers the operational question behind this whole feature: "how many of
 * the photos we're taking are actually useful?" In-memory only (resets on
 * restart) — this is a live operational gauge for the dashboard/health
 * check, not an audit log; see docs/vision-pipeline.md for why durable
 * per-frame analytics were deliberately left out of this pass.
 */
export interface VisionPipelineStats {
  framesSeen: number;
  framesDiscarded: number;
  framesSkippedNoChange: number;
  framesStored: number;
  discardReasons: Partial<Record<FrameDiscardReason, number>>;
}

class VisionStatsTracker {
  private stats: VisionPipelineStats = {
    framesSeen: 0,
    framesDiscarded: 0,
    framesSkippedNoChange: 0,
    framesStored: 0,
    discardReasons: {},
  };

  recordDiscarded(reason: FrameDiscardReason) {
    this.stats.framesSeen++;
    this.stats.framesDiscarded++;
    this.stats.discardReasons[reason] = (this.stats.discardReasons[reason] ?? 0) + 1;
  }

  recordSkippedNoChange() {
    this.stats.framesSeen++;
    this.stats.framesSkippedNoChange++;
  }

  recordStored() {
    this.stats.framesSeen++;
    this.stats.framesStored++;
  }

  snapshot(): VisionPipelineStats {
    return { ...this.stats, discardReasons: { ...this.stats.discardReasons } };
  }

  /** Fraction of seen frames that were actually kept — the headline number. */
  usefulFrameRate(): number {
    return this.stats.framesSeen === 0 ? 1 : this.stats.framesStored / this.stats.framesSeen;
  }

  reset() {
    this.stats = { framesSeen: 0, framesDiscarded: 0, framesSkippedNoChange: 0, framesStored: 0, discardReasons: {} };
  }
}

export const visionStats = new VisionStatsTracker();
