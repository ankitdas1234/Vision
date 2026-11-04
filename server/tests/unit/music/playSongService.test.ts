import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/commands/CommandRegistry", () => ({
  commandRegistry: { dispatch: vi.fn().mockResolvedValue({ success: true }) },
}));

vi.mock("../../../src/performance/DanceRunner", () => ({
  runDanceToBeats: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/music/JamendoMusicService", () => ({
  searchJamendo: vi.fn(),
  fetchJamendoAudio: vi.fn(),
}));

vi.mock("../../../src/music/MusicUploadService", () => ({
  musicUploadService: { uploadTrack: vi.fn(), queueForPlayback: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../../../src/music/SongQuestionProposer", () => ({
  proposeSongQuestion: vi.fn(),
}));

vi.mock("../../../src/repositories/people.repository", () => ({
  peopleRepository: { findById: vi.fn().mockResolvedValue({ autonomousDanceEnabled: true }) },
}));

vi.mock("../../../src/repositories/playRequests.repository", () => {
  const rows = new Map<string, any>();
  let counter = 0;
  return {
    playRequestsRepository: {
      async create(input: any) {
        const id = `req-${++counter}`;
        const row = { id, personId: input.personId ?? null, robotId: input.robotId ?? null, requestedText: input.requestedText, status: "SEARCHING", matchedTrackId: null, conversationLog: [], createdAt: new Date(), updatedAt: new Date() };
        rows.set(id, row);
        return row;
      },
      async findById(id: string) {
        return rows.get(id) ?? null;
      },
      async updateStatus(id: string, status: string, matchedTrackId?: string | null) {
        const row = rows.get(id);
        if (row) {
          row.status = status;
          if (matchedTrackId !== undefined) row.matchedTrackId = matchedTrackId;
        }
      },
      async appendConversationTurn(id: string, turn: any) {
        const row = rows.get(id);
        if (row) row.conversationLog = [...row.conversationLog, turn];
      },
      async recordAnswerForLatestTurn(id: string, answer: string) {
        const row = rows.get(id);
        if (!row || row.conversationLog.length === 0) return;
        const log = [...row.conversationLog];
        const last = log.length - 1;
        if (log[last].answer === null) log[last] = { ...log[last], answer };
        row.conversationLog = log;
      },
      __rows: rows,
    },
  };
});

import { searchJamendo, fetchJamendoAudio } from "../../../src/music/JamendoMusicService";
import { musicUploadService } from "../../../src/music/MusicUploadService";
import { proposeSongQuestion } from "../../../src/music/SongQuestionProposer";
import { peopleRepository } from "../../../src/repositories/people.repository";
import { playRequestsRepository } from "../../../src/repositories/playRequests.repository";
import { startPlayRequest, handleConversationReply, __resetPlaySongStateForTests } from "../../../src/music/PlaySongService";
import { commandRegistry } from "../../../src/commands/CommandRegistry";
import { runDanceToBeats } from "../../../src/performance/DanceRunner";

const mockSearch = vi.mocked(searchJamendo);
const mockFetch = vi.mocked(fetchJamendoAudio);
const mockUpload = vi.mocked(musicUploadService.uploadTrack);
const mockProposeQuestion = vi.mocked(proposeSongQuestion);
const mockFindPerson = vi.mocked(peopleRepository.findById);
const mockDispatch = vi.mocked(commandRegistry.dispatch);
const mockDance = vi.mocked(runDanceToBeats);

function resetAllMocks() {
  __resetPlaySongStateForTests();
  mockSearch.mockReset();
  mockFetch.mockReset();
  mockUpload.mockReset();
  mockProposeQuestion.mockReset();
  mockFindPerson.mockReset().mockResolvedValue({ autonomousDanceEnabled: true } as never);
  mockDispatch.mockClear();
  mockDance.mockReset().mockResolvedValue(undefined);
}

const fakeTrack = { id: "track-1", title: "Some Song", uploadedByUserId: null, mediaId: null, durationMs: 4000, bpm: 120, beatConfidence: 0.8, beatTimestampsMs: [0, 500], checksum: null, createdAt: new Date() };

describe("PlaySongService — found flow", () => {
  it("logs the request, searches, asks a question, and plays the track once found", async () => {
    resetAllMocks();
    mockSearch.mockResolvedValue([{ id: "j1", name: "Some Song", artistName: "Some Artist", durationSec: 200, audioUrl: "https://example.com/a.mp3" }]);
    mockFetch.mockResolvedValue(Buffer.from("fake-audio"));
    mockUpload.mockResolvedValue({ track: fakeTrack, beatDetectionConfidence: 0.8 });
    mockProposeQuestion.mockResolvedValue({ question: "Who is your favorite artist?", fromModel: false });

    const request = await startPlayRequest("robot-1", "person-1", "play some song");

    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "AUDIO_SPEAK", params: { text: "Who is your favorite artist?" } }));

    await handleConversationReply("robot-1", request.id, "person-1", 0, "I love Radiohead!");

    const finalRow = await playRequestsRepository.findById(request.id);
    expect(finalRow?.status).toBe("PLAYED");
    expect(finalRow?.matchedTrackId).toBe("track-1");
    expect(mockDance).toHaveBeenCalled();
  });

  it("logs the conversation Q&A pair onto the play request", async () => {
    resetAllMocks();
    mockSearch.mockResolvedValue([{ id: "j1", name: "Some Song", artistName: "Some Artist", durationSec: 200, audioUrl: "https://example.com/a.mp3" }]);
    mockFetch.mockResolvedValue(Buffer.from("fake-audio"));
    mockUpload.mockResolvedValue({ track: fakeTrack, beatDetectionConfidence: 0.8 });
    mockProposeQuestion.mockResolvedValue({ question: "Why do you love this song?", fromModel: false });

    const request = await startPlayRequest("robot-2", "person-2", "play some song");
    await handleConversationReply("robot-2", request.id, "person-2", 0, "It reminds me of summer.");

    const finalRow = await playRequestsRepository.findById(request.id);
    expect(finalRow?.conversationLog[0]).toMatchObject({ question: "Why do you love this song?", answer: "It reminds me of summer." });
  });

  it("dances by default when the person hasn't opted out", async () => {
    resetAllMocks();
    mockSearch.mockResolvedValue([{ id: "j1", name: "Some Song", artistName: "Some Artist", durationSec: 200, audioUrl: "https://example.com/a.mp3" }]);
    mockFetch.mockResolvedValue(Buffer.from("fake-audio"));
    mockUpload.mockResolvedValue({ track: fakeTrack, beatDetectionConfidence: 0.8 });
    mockProposeQuestion.mockResolvedValue({ question: "Who's your favorite artist?", fromModel: false });
    mockFindPerson.mockResolvedValue({ autonomousDanceEnabled: true } as never);

    const request = await startPlayRequest("robot-6", "person-6", "play some song");
    await handleConversationReply("robot-6", request.id, "person-6", 0, "answer");

    expect(mockDance).toHaveBeenCalled();
  });

  it("plays the music but skips dancing when the person opted out ('don't dance')", async () => {
    resetAllMocks();
    mockSearch.mockResolvedValue([{ id: "j1", name: "Some Song", artistName: "Some Artist", durationSec: 200, audioUrl: "https://example.com/a.mp3" }]);
    mockFetch.mockResolvedValue(Buffer.from("fake-audio"));
    mockUpload.mockResolvedValue({ track: fakeTrack, beatDetectionConfidence: 0.8 });
    mockProposeQuestion.mockResolvedValue({ question: "Who's your favorite artist?", fromModel: false });
    mockFindPerson.mockResolvedValue({ autonomousDanceEnabled: false } as never);

    const request = await startPlayRequest("robot-7", "person-7", "play some song");
    await handleConversationReply("robot-7", request.id, "person-7", 0, "answer");

    expect(mockDance).not.toHaveBeenCalled();
    const finalRow = await playRequestsRepository.findById(request.id);
    expect(finalRow?.status).toBe("PLAYED"); // music still plays even without dancing
  });

  it("defaults to dancing (opted-in) when there's no personId at all (anonymous request)", async () => {
    resetAllMocks();
    mockSearch.mockResolvedValue([{ id: "j1", name: "Some Song", artistName: "Some Artist", durationSec: 200, audioUrl: "https://example.com/a.mp3" }]);
    mockFetch.mockResolvedValue(Buffer.from("fake-audio"));
    mockUpload.mockResolvedValue({ track: fakeTrack, beatDetectionConfidence: 0.8 });
    mockProposeQuestion.mockResolvedValue({ question: "Who's your favorite artist?", fromModel: false });

    const request = await startPlayRequest("robot-8", null, "play some song");
    await handleConversationReply("robot-8", request.id, null, 0, "answer");

    expect(mockFindPerson).not.toHaveBeenCalled(); // no personId to even look up
    expect(mockDance).toHaveBeenCalled(); // defaults to dancing
  });
});

describe("PlaySongService — not-found flow", () => {
  it("reports honestly and never fakes a substitute when nothing matches", async () => {
    resetAllMocks();
    mockSearch.mockResolvedValue([]);
    mockProposeQuestion.mockResolvedValue({ question: "Who is your favorite artist?", fromModel: false });

    const request = await startPlayRequest("robot-3", "person-3", "play something extremely obscure");
    await handleConversationReply("robot-3", request.id, "person-3", 0, "No idea, just curious.");

    const finalRow = await playRequestsRepository.findById(request.id);
    expect(finalRow?.status).toBe("NOT_FOUND");
    expect(mockDance).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ params: { text: expect.stringContaining("don't have a licensed copy") } }));
  });

  it("never throws even if the fetch step itself throws", async () => {
    resetAllMocks();
    mockSearch.mockResolvedValue([{ id: "j1", name: "Some Song", artistName: "Artist", durationSec: 200, audioUrl: "https://example.com/a.mp3" }]);
    mockFetch.mockRejectedValue(new Error("network down"));
    mockProposeQuestion.mockResolvedValue({ question: "Who is your favorite artist?", fromModel: false });

    const request = await startPlayRequest("robot-4", "person-4", "play some song");
    await expect(handleConversationReply("robot-4", request.id, "person-4", 0, "answer")).resolves.not.toThrow();

    const finalRow = await playRequestsRepository.findById(request.id);
    expect(finalRow?.status).toBe("NOT_FOUND");
  });
});

describe("PlaySongService — conversation length bound", () => {
  it("stops asking after MAX_QUESTIONS even if the search is still pending, without hanging", async () => {
    resetAllMocks();
    let resolveSearch: (v: any) => void = () => {};
    mockSearch.mockImplementation(() => new Promise((resolve) => (resolveSearch = resolve)));
    mockProposeQuestion.mockResolvedValue({ question: "Tell me more?", fromModel: false });

    const request = await startPlayRequest("robot-5", "person-5", "play some song");
    await handleConversationReply("robot-5", request.id, "person-5", 0, "a1");
    await handleConversationReply("robot-5", request.id, "person-5", 1, "a2");
    await handleConversationReply("robot-5", request.id, "person-5", 2, "a3"); // hits MAX_QUESTIONS — must return promptly, not hang

    const speakCalls = mockDispatch.mock.calls.filter((c) => (c[0] as any).type === "AUDIO_SPEAK");
    expect(speakCalls.length).toBeLessThanOrEqual(4); // 3 questions + the "still looking" message
    expect(speakCalls.some((c) => (c[0] as any).params.text.includes("still looking"))).toBe(true);

    // Clean up the dangling promise so it doesn't leak into other tests.
    resolveSearch([]);
  });
});
