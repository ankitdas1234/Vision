import { describe, it, expect, beforeEach } from "vitest";
import { MultiFrameIdentityTracker } from "../../../src/perception/multiFrameIdentity";
import { faceRecognitionConfig } from "../../../src/config/faceRecognitionConfig";

describe("MultiFrameIdentityTracker", () => {
  let tracker: MultiFrameIdentityTracker;
  const required = faceRecognitionConfig.voting.requiredAgreeingVotes;

  beforeEach(() => {
    tracker = new MultiFrameIdentityTracker();
  });

  it("stays UNKNOWN with a single vote for someone", () => {
    const outcome = tracker.castVote("t1", { personId: "person-a", distance: 0.2 });
    expect(outcome.status).not.toBe("CONFIRMED");
  });

  it("never confirms identity from a single frame regardless of distance", () => {
    const outcome = tracker.castVote("t1", { personId: "person-a", distance: 0.01 });
    expect(outcome.status).not.toBe("CONFIRMED");
    expect(outcome.personId).toBeNull();
  });

  it("confirms identity once enough agreeing votes accumulate", () => {
    let outcome;
    for (let i = 0; i < required; i++) {
      outcome = tracker.castVote("t2", { personId: "person-b", distance: 0.3 });
    }
    expect(outcome!.status).toBe("CONFIRMED");
    expect(outcome!.personId).toBe("person-b");
  });

  it("does not confirm when votes are split between different people", () => {
    let outcome;
    for (let i = 0; i < required; i++) {
      outcome = tracker.castVote("t3", { personId: i % 2 === 0 ? "person-x" : "person-y", distance: 0.3 });
    }
    expect(outcome!.status).not.toBe("CONFIRMED");
  });

  it("treats null-personId votes (no match found) as non-votes, not votes against", () => {
    for (let i = 0; i < required - 1; i++) {
      tracker.castVote("t4", { personId: "person-c", distance: 0.3 });
    }
    tracker.castVote("t4", { personId: null, distance: Infinity });
    const outcome = tracker.castVote("t4", { personId: "person-c", distance: 0.3 });
    expect(outcome.status).toBe("CONFIRMED");
  });

  it("keeps different tracks independent", () => {
    for (let i = 0; i < required; i++) tracker.castVote("track-A", { personId: "alice", distance: 0.2 });
    const outcomeB = tracker.currentOutcome("track-B");
    expect(outcomeB.status).toBe("UNKNOWN");
  });

  it("clearTrack resets voting state", () => {
    for (let i = 0; i < required; i++) tracker.castVote("t5", { personId: "person-d", distance: 0.2 });
    tracker.clearTrack("t5");
    expect(tracker.currentOutcome("t5").status).toBe("UNKNOWN");
  });

  it("caps history at maxVotesPerTrack, letting old votes age out", () => {
    const max = faceRecognitionConfig.voting.maxVotesPerTrack;
    for (let i = 0; i < max + 10; i++) {
      tracker.castVote("t6", { personId: `person-${i}`, distance: 0.2 });
    }
    const outcome = tracker.currentOutcome("t6");
    expect(outcome.totalVotes).toBeLessThanOrEqual(max);
  });
});
