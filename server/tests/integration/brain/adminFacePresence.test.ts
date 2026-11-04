import { describe, it, expect, beforeEach, vi } from "vitest";
import sharp from "sharp";

// Only personRecognizer needs to be fake here — object/person DETECTION
// (is there a person at all) still runs for real; only the extra identity
// step (who specifically) is substituted, since driving a real CONFIRMED
// admin match through EmbeddingPersonRecognizer needs a populated
// person_faces table plus the native ML stack, neither of which this test
// is about. See docs/troubleshooting.md for why that stack isn't always
// available.
const recognizeMock = vi.fn();
const detectMock = vi.fn();
vi.mock("../../../src/brain/perception", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/brain/perception")>();
  return { ...actual, personRecognizer: { recognize: recognizeMock }, personDetector: { detect: detectMock } };
});

const { BrainOrchestrator } = await import("../../../src/brain/BrainOrchestrator");
const { resetMotionDetectorFor } = await import("../../../src/perception/motionDetection");
const { resetPresenceTrackingFor } = await import("../../../src/ultrasonic/PresenceDetector");
const { resetLowLightState } = await import("../../../src/perception/LowLightAssistance");
const { resetAdminPresence, isAdminFacePresent } = await import("../../../src/people/AdminPresence");

const ROBOT_ID = "vision-001";

async function personFrame(): Promise<Buffer> {
  const width = 320;
  const height = 240;
  // Full-range random noise (not a narrow band) is what avoids the
  // BLANK_UNIFORM discard — this is the same construction visionPipeline.test.ts
  // uses, plus a bright rectangular "person" blob so the (real, unmocked)
  // motion detector has a genuine foreground shape to report, satisfying
  // the person.personDetected check that gates whether personRecognizer
  // ever gets called at all (see brain/observationProcessor.ts).
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = Math.floor(Math.random() * 256);
  for (let y = 40; y < 220; y++) {
    for (let x = 120; x < 180; x++) {
      const idx = (y * width + x) * 3;
      pixels[idx] = 250;
      pixels[idx + 1] = 250;
      pixels[idx + 2] = 250;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg().toBuffer();
}

describe("a confirmed admin face reaches AdminPresence via a real brain cycle", () => {
  beforeEach(() => {
    resetMotionDetectorFor(ROBOT_ID);
    resetPresenceTrackingFor(ROBOT_ID);
    resetLowLightState();
    resetAdminPresence();
    recognizeMock.mockReset();
    detectMock.mockReset();
    detectMock.mockResolvedValue({ personDetected: true, boundingBox: { x: 40, y: 30, width: 80, height: 120 }, centerX: 80, centerY: 90, confidence: 0.95 });
  });

  it("notes face presence when recognition CONFIRMS an ADMIN", async () => {
    recognizeMock.mockResolvedValue({
      personId: "admin-1", name: "Ada", category: "ADMIN", confidence: 1, status: "CONFIRMED", skipReason: null,
    });
    const brain = new BrainOrchestrator();
    await brain.observeAndReact(await personFrame(), ROBOT_ID);
    expect(isAdminFacePresent(ROBOT_ID)).toBe(true);
  }, 15_000);

  it("does NOT note presence for a CONFIRMED non-admin", async () => {
    recognizeMock.mockResolvedValue({
      personId: "guest-1", name: "Guest", category: "GUEST", confidence: 1, status: "CONFIRMED", skipReason: null,
    });
    const brain = new BrainOrchestrator();
    await brain.observeAndReact(await personFrame(), ROBOT_ID);
    expect(isAdminFacePresent(ROBOT_ID)).toBe(false);
  }, 15_000);

  it("does NOT note presence for a merely PROVISIONAL admin match", async () => {
    recognizeMock.mockResolvedValue({
      personId: "admin-1", name: "Ada", category: "ADMIN", confidence: 0.4, status: "PROVISIONAL", skipReason: null,
    });
    const brain = new BrainOrchestrator();
    await brain.observeAndReact(await personFrame(), ROBOT_ID);
    expect(isAdminFacePresent(ROBOT_ID)).toBe(false);
  }, 15_000);
});

