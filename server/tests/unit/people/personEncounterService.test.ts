import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";

const { mockPeople, mockFaces, mockObservations, mockRobots } = vi.hoisted(() => ({
  mockPeople: {
    create: vi.fn(async (input: any) => ({ id: "new-person-id", visitCount: 0, lastSeen: null, ...input })),
    findById: vi.fn(async (id: string) => ({ id, visitCount: 2, lastSeen: new Date(Date.now() - 60_000).toISOString() })),
    update: vi.fn(async (id: string, patch: any) => ({ id, ...patch })),
  },
  mockFaces: { create: vi.fn(async () => ({ id: "face-1" })) },
  mockObservations: { record: vi.fn(async (input: any) => ({ id: "obs-1", ...input })) },
  mockRobots: { findByCode: vi.fn(async () => ({ id: "robot-db-id", currentLocation: "living room" })) },
}));

vi.mock("../../../src/repositories/people.repository", () => ({ peopleRepository: mockPeople }));
vi.mock("../../../src/repositories/personFaces.repository", () => ({ personFacesRepository: mockFaces }));
vi.mock("../../../src/repositories/people-observations.repository", () => ({ personObservationsRepository: mockObservations }));
vi.mock("../../../src/repositories/robot.repository", () => ({ robotRepository: mockRobots }));

import { personEncounterService } from "../../../src/people/PersonEncounterService";

let dummyBuffer: Buffer;

describe("PersonEncounterService", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    dummyBuffer = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 100, g: 120, b: 140 } } }).jpeg().toBuffer();
  });

  it("auto-registers a brand new person on first sight", async () => {
    const outcome = await personEncounterService.recordEncounter({
      robotId: "vision-001",
      recognition: { personId: null, name: null, category: "UNKNOWN", confidence: 0 },
      faceImageBuffer: dummyBuffer,
      mediaId: "media-1",
      talkedTo: false,
      confidence: 0.7,
    });

    expect(outcome?.isNewPerson).toBe(true);
    expect(mockPeople.create).toHaveBeenCalledTimes(1);
    expect(mockFaces.create).toHaveBeenCalledTimes(1);
    expect(mockObservations.record).toHaveBeenCalledTimes(1);
    expect(mockObservations.record.mock.calls[0][0]).toMatchObject({ mediaId: "media-1", talkedTo: false });
  });

  it("tags the logged encounter with the robot's current location", async () => {
    await personEncounterService.recordEncounter({
      robotId: "vision-001",
      recognition: { personId: null, name: null, category: "UNKNOWN", confidence: 0 },
      faceImageBuffer: dummyBuffer,
      mediaId: null,
      talkedTo: false,
      confidence: 0.5,
    });
    expect(mockObservations.record.mock.calls[0][0].context).toMatchObject({ location: "living room" });
  });

  it("recalls a known person instead of creating a duplicate", async () => {
    const outcome = await personEncounterService.recordEncounter({
      robotId: "vision-001",
      recognition: { personId: "existing-person", name: "Sam", category: "FAMILY", confidence: 0.95 },
      faceImageBuffer: dummyBuffer,
      mediaId: "media-2",
      talkedTo: true,
      confidence: 0.95,
    });

    expect(outcome?.isNewPerson).toBe(false);
    expect(outcome?.personId).toBe("existing-person");
    expect(mockPeople.create).not.toHaveBeenCalled();
    expect(mockPeople.update).toHaveBeenCalledWith("existing-person", expect.objectContaining({ lastSeen: expect.any(Date) }));
  });

  it("increments visit count for a returning person seen after a real gap", async () => {
    mockPeople.findById.mockResolvedValueOnce({ id: "existing-person", visitCount: 3, lastSeen: new Date(Date.now() - 60 * 60 * 1000).toISOString() });
    await personEncounterService.recordEncounter({
      robotId: "vision-001",
      recognition: { personId: "existing-person", name: "Sam", category: "FAMILY", confidence: 0.95 },
      faceImageBuffer: dummyBuffer,
      mediaId: null,
      talkedTo: false,
      confidence: 0.9,
    });
    expect(mockPeople.update).toHaveBeenCalledWith("existing-person", expect.objectContaining({ visitCount: 4 }));
  });

  it("does not increment visit count for the same continuous sighting", async () => {
    mockPeople.findById.mockResolvedValueOnce({ id: "existing-person", visitCount: 3, lastSeen: new Date().toISOString() });
    await personEncounterService.recordEncounter({
      robotId: "vision-001",
      recognition: { personId: "existing-person", name: "Sam", category: "FAMILY", confidence: 0.95 },
      faceImageBuffer: dummyBuffer,
      mediaId: null,
      talkedTo: false,
      confidence: 0.9,
    });
    expect(mockPeople.update).toHaveBeenCalledWith("existing-person", expect.objectContaining({ visitCount: 3 }));
  });

  it("never throws even if a repository call fails", async () => {
    mockObservations.record.mockRejectedValueOnce(new Error("db down"));
    const outcome = await personEncounterService.recordEncounter({
      robotId: "vision-001",
      recognition: { personId: null, name: null, category: "UNKNOWN", confidence: 0 },
      faceImageBuffer: dummyBuffer,
      mediaId: null,
      talkedTo: false,
      confidence: 0.5,
    });
    expect(outcome).toBeNull();
  });
});
