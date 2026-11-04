import { describe, it, expect, vi, beforeEach } from "vitest";

const recorded: Array<{ eventType: string; personId: string | null; wasAdmin: boolean }> = [];
const interruptionCounts: Record<string, number> = {};
const trustScores: Record<string, number> = {};

vi.mock("../../../src/repositories/speechEvents.repository", () => ({
  speechEventsRepository: {
    record: (input: { eventType: string; personId: string | null; wasAdmin: boolean }) => {
      recorded.push(input);
      return Promise.resolve(input);
    },
    interruptionCount: (personId: string) => Promise.resolve(interruptionCounts[personId] ?? 0),
  },
}));

vi.mock("../../../src/repositories/people.repository", () => ({
  peopleRepository: {
    findById: (id: string) => Promise.resolve(id in trustScores ? { id, trustScore: trustScores[id] } : null),
  },
}));

function seg(overrides: Partial<import("../../../src/audio/Diarization").SpeakerSegment>) {
  return {
    speakerTag: "spk_0", transcript: "hello", confidence: 1,
    startMs: 0, endMs: 1000, isAdmin: false, personId: null,
    ...overrides,
  };
}

describe("ConversationArbiterService", () => {
  beforeEach(() => {
    recorded.length = 0;
    Object.keys(interruptionCounts).forEach((k) => delete interruptionCounts[k]);
    Object.keys(trustScores).forEach((k) => delete trustScores[k]);
    vi.resetModules();
  });

  it("passes through a single non-overlapping speaker as a normal TURN", async () => {
    const { conversationArbiter } = await import("../../../src/audio/ConversationArbiter");
    const result = await conversationArbiter.arbitrate("robot-1", [seg({ transcript: "move forward" })]);
    expect(result.chosenSegment?.transcript).toBe("move forward");
    expect(result.replies).toHaveLength(0);
    expect(recorded).toEqual([expect.objectContaining({ eventType: "TURN", personId: null, wasAdmin: false })]);
  });

  it("two non-admins overlapping: picks a winner and politely asks the other to wait", async () => {
    const { conversationArbiter } = await import("../../../src/audio/ConversationArbiter");
    const a = seg({ speakerTag: "a", personId: "person-a", transcript: "hi", startMs: 0, endMs: 2000 });
    const b = seg({ speakerTag: "b", personId: "person-b", transcript: "hey there", startMs: 500, endMs: 1500 });
    const result = await conversationArbiter.arbitrate("robot-1", [a, b]);

    expect(result.chosenSegment).not.toBeNull();
    expect(result.replies).toHaveLength(1);
    expect(result.replies[0].text).toMatch(/hold on a second/i);
    // one TURN + one INTERRUPTION recorded
    expect(recorded.some((r) => r.eventType === "TURN")).toBe(true);
    expect(recorded.some((r) => r.eventType === "INTERRUPTION")).toBe(true);
  });

  it("deprioritizes a person with recent interruption history (the 'talks too much' signal)", async () => {
    const { conversationArbiter } = await import("../../../src/audio/ConversationArbiter");
    interruptionCounts["chatty-person"] = 5; // talked over people 5 times recently
    trustScores["chatty-person"] = 0;
    trustScores["quiet-person"] = 0;

    const chatty = seg({ speakerTag: "chatty", personId: "chatty-person", transcript: "me me me", startMs: 0, endMs: 2000 });
    const quiet = seg({ speakerTag: "quiet", personId: "quiet-person", transcript: "excuse me", startMs: 100, endMs: 1900 });

    const result = await conversationArbiter.arbitrate("robot-1", [chatty, quiet]);
    expect(result.chosenSegment?.speakerTag).toBe("quiet");
  });

  it("admin directly addressing Vision wins immediately over an overlapping non-admin", async () => {
    const { conversationArbiter } = await import("../../../src/audio/ConversationArbiter");
    const admin = seg({ speakerTag: "admin", isAdmin: true, transcript: "Vision, stop that", startMs: 0, endMs: 2000 });
    const visitor = seg({ speakerTag: "visitor", transcript: "can you dance for me", startMs: 200, endMs: 1800 });

    const result = await conversationArbiter.arbitrate("robot-1", [admin, visitor]);
    expect(result.chosenSegment?.speakerTag).toBe("admin");
    expect(result.chosenIsAuthorizedAdmin).toBe(true);
    expect(result.replies.some((r) => r.targetSpeakerTag === "visitor")).toBe(true);
  });

  it("admin speaking in the background WITHOUT addressing Vision gets the polite wait line, nobody's turn proceeds", async () => {
    const { conversationArbiter } = await import("../../../src/audio/ConversationArbiter");
    const admin = seg({ speakerTag: "admin", isAdmin: true, transcript: "so anyway, about dinner tonight", startMs: 0, endMs: 2000 });
    const visitor = seg({ speakerTag: "visitor", transcript: "hello robot", startMs: 200, endMs: 1800 });

    const result = await conversationArbiter.arbitrate("robot-1", [admin, visitor]);
    expect(result.chosenSegment).toBeNull();
    expect(result.replies).toHaveLength(1);
    expect(result.replies[0].targetSpeakerTag).toBe("admin");
    expect(result.replies[0].text).toBe("Sir, I can't listen properly right now — could you wait a bit?");
  });
  it("stays polite with someone who has only cut in once or twice", async () => {
    const { conversationArbiter } = await import("../../../src/audio/ConversationArbiter");
    const { clearAnnoyance, isAnnoyed } = await import("../../../src/mental/Annoyance");
    clearAnnoyance();
    interruptionCounts["occasional"] = 1;

    const talker = seg({ speakerTag: "a", personId: "listener", transcript: "so as I was saying", startMs: 0, endMs: 2000 });
    const cutIn = seg({ speakerTag: "b", personId: "occasional", transcript: "hey robot", startMs: 200, endMs: 1800 });

    const result = await conversationArbiter.arbitrate("robot-1", [talker, cutIn]);
    const toCutIn = result.replies.find((r) => r.targetSpeakerTag === "b");
    expect(toCutIn?.text).toMatch(/hold on a second, please/i);
    expect(isAnnoyed("robot-1")).toBe(false);
  });

  it("gets short with someone who keeps talking over people, and stays annoyed afterwards", async () => {
    const { conversationArbiter } = await import("../../../src/audio/ConversationArbiter");
    const { clearAnnoyance, isAnnoyed } = await import("../../../src/mental/Annoyance");
    clearAnnoyance();
    interruptionCounts["persistent"] = 6;
    trustScores["persistent"] = 50; // still wins priority — this is about tone, not who gets heard
    trustScores["listener"] = 90;

    const talker = seg({ speakerTag: "a", personId: "listener", transcript: "so as I was saying", startMs: 0, endMs: 2000 });
    const cutIn = seg({ speakerTag: "b", personId: "persistent", transcript: "hey robot", startMs: 200, endMs: 1800 });

    const result = await conversationArbiter.arbitrate("robot-1", [talker, cutIn]);
    const toCutIn = result.replies.find((r) => r.targetSpeakerTag === "b");
    expect(toCutIn?.text).toMatch(/keep cutting in/i);
    expect(isAnnoyed("robot-1")).toBe(true);
    // Still logged as an ordinary interruption — the tone changed, the bookkeeping didn't.
    expect(recorded.some((r) => r.eventType === "INTERRUPTION" && r.personId === "persistent")).toBe(true);
  });
});
