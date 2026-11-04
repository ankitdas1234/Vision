import { faceRecognitionConfig } from "../config/faceRecognitionConfig";

/**
 * MULTI-FRAME IDENTITY VOTING
 * ----------------------------
 * A single nearest-embedding match is a *candidate*, not a decision —
 * lighting, a bad angle, or a genuinely similar-looking stranger can all
 * produce one convincing-looking match on a single frame. This module
 * requires several independent frames from the same track to agree
 * before an identity is CONFIRMED; anything else stays PROVISIONAL
 * (leaning toward someone, not yet acted on) or UNKNOWN.
 *
 * "Track" here is deliberately opaque — callers pass whatever id groups
 * frames as "probably the same continuous sighting" (see
 * attention/AttentionController.ts for the tracking concept this reuses).
 * A vote is cast once per processed frame (i.e. after the frame/face
 * quality gates and dedup have already let it through — see
 * qualityGate.ts), not once per raw camera frame.
 */

export type IdentityStatus = "CONFIRMED" | "PROVISIONAL" | "UNKNOWN";

export interface IdentityVote {
  personId: string | null; // null = this frame's nearest match wasn't close enough to count as anyone
  distance: number;
}

export interface VotingOutcome {
  status: IdentityStatus;
  personId: string | null;
  /** Votes accumulated so far for the leading candidate, out of
   * requiredAgreeingVotes. */
  agreeingVotes: number;
  totalVotes: number;
}

interface TrackVotes {
  votes: IdentityVote[];
  lastUpdated: number;
}

export class MultiFrameIdentityTracker {
  private readonly tracks = new Map<string, TrackVotes>();

  private pruneStale(now: number): void {
    const ttl = faceRecognitionConfig.voting.trackTtlMs;
    for (const [trackId, t] of this.tracks) {
      if (now - t.lastUpdated > ttl) this.tracks.delete(trackId);
    }
  }

  /** Records one frame's nearest-match result for `trackId` and returns
   * the current voting outcome. Pure bookkeeping — callers decide what
   * to actually do (greet, log, gate ADMIN actions) based on `status`. */
  castVote(trackId: string, vote: IdentityVote): VotingOutcome {
    const now = Date.now();
    this.pruneStale(now);

    const existing = this.tracks.get(trackId) ?? { votes: [], lastUpdated: now };
    existing.votes.push(vote);
    if (existing.votes.length > faceRecognitionConfig.voting.maxVotesPerTrack) {
      existing.votes.shift();
    }
    existing.lastUpdated = now;
    this.tracks.set(trackId, existing);

    return this.tally(existing.votes);
  }

  private tally(votes: IdentityVote[]): VotingOutcome {
    const counts = new Map<string, number>();
    for (const v of votes) {
      if (!v.personId) continue;
      counts.set(v.personId, (counts.get(v.personId) ?? 0) + 1);
    }

    let leadingPersonId: string | null = null;
    let leadingCount = 0;
    for (const [personId, count] of counts) {
      if (count > leadingCount) {
        leadingPersonId = personId;
        leadingCount = count;
      }
    }

    const required = faceRecognitionConfig.voting.requiredAgreeingVotes;
    const status: IdentityStatus = leadingCount >= required && leadingPersonId ? "CONFIRMED" : leadingPersonId ? "PROVISIONAL" : "UNKNOWN";

    return { status, personId: status === "CONFIRMED" ? leadingPersonId : null, agreeingVotes: leadingCount, totalVotes: votes.length };
  }

  /** Current outcome without casting a new vote — for callers that need
   * to check status between frames. */
  currentOutcome(trackId: string): VotingOutcome {
    const t = this.tracks.get(trackId);
    if (!t) return { status: "UNKNOWN", personId: null, agreeingVotes: 0, totalVotes: 0 };
    return this.tally(t.votes);
  }

  clearTrack(trackId: string): void {
    this.tracks.delete(trackId);
  }

  get activeTrackCount(): number {
    return this.tracks.size;
  }
}

export const multiFrameIdentityTracker = new MultiFrameIdentityTracker();
