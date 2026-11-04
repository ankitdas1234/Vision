import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import sharp from "sharp";

// Same pattern as adminFacePresence.test.ts — only identity recognition is
// faked; real detection, real command dispatch, real safety manager.
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
const { resetAdminPresence } = await import("../../../src/people/AdminPresence");
const { safetyManager } = await import("../../../src/safety/SafetyManager");
const {
  openConfirmationWindow, isConfirmationPending, resetPendingConfirmations, CONFIRMATION_WINDOW_MS,
} = await import("../../../src/people/PendingEmergencyStopConfirmation");

const ROBOT_ID = "vision-001";

async function personFrame(): Promise<Buffer> {
  const width = 320;
  const height = 240;
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = Math.floor(Math.random() * 256);
  for (let y = 40; y < 220; y++) {
    for (let x = 120; x < 180; x++) {
      const idx = (y * width + x) * 3;
      pixels[idx] = 250; pixels[idx + 1] = 250; pixels[idx + 2] = 250;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg().toBuffer();
}

describe("actively checking a pending emergency-stop confirmation", () => {
  beforeEach(() => {
    resetMotionDetectorFor(ROBOT_ID);
    resetPresenceTrackingFor(ROBOT_ID);
    resetLowLightState();
    resetAdminPresence();
    resetPendingConfirmations();
    recognizeMock.mockReset();
    detectMock.mockReset();
    detectMock.mockResolvedValue({ personDetected: true, boundingBox: { x: 40, y: 30, width: 80, height: 120 }, centerX: 80, centerY: 90, confidence: 0.95 });
  });

  // EMERGENCY_STOP really executes through the real command pipeline here
  // (nothing mocked below BrainOrchestrator), which really does flip
  // safetyManager's global emergency flag — clean it up so it can't leak
  // into any other test that happens to share this worker.
  afterEach(() => safetyManager.setEmergency(false));

  it("actually stops once a CONFIRMED admin face turns up inside the window", async () => {
    openConfirmationWindow(ROBOT_ID, null);
    recognizeMock.mockResolvedValue({ personId: "admin-1", name: "Ada", category: "ADMIN", confidence: 1, status: "CONFIRMED", skipReason: null });

    const brain = new BrainOrchestrator();
    await brain.observeAndReact(await personFrame(), ROBOT_ID);

    expect(safetyManager.isEmergencyActive()).toBe(true);
    expect(isConfirmationPending(ROBOT_ID)).toBe(false); // resolved, not left hanging
  }, 15_000);

  it("does NOT stop for a CONFIRMED non-admin — the window stays open", async () => {
    openConfirmationWindow(ROBOT_ID, null);
    recognizeMock.mockResolvedValue({ personId: "guest-1", name: "Guest", category: "GUEST", confidence: 1, status: "CONFIRMED", skipReason: null });

    const brain = new BrainOrchestrator();
    await brain.observeAndReact(await personFrame(), ROBOT_ID);

    expect(safetyManager.isEmergencyActive()).toBe(false);
    expect(isConfirmationPending(ROBOT_ID)).toBe(true); // still waiting, within the window
  }, 15_000);

  it("does nothing at all when there is no pending confirmation to check", async () => {
    recognizeMock.mockResolvedValue({ personId: "admin-1", name: "Ada", category: "ADMIN", confidence: 1, status: "CONFIRMED", skipReason: null });

    const brain = new BrainOrchestrator();
    await brain.observeAndReact(await personFrame(), ROBOT_ID);

    // A confirmed admin walking by with nobody having asked for a stop
    // must never trigger one — this only fires in response to a request.
    expect(safetyManager.isEmergencyActive()).toBe(false);
  }, 15_000);

  it("gives up and says so once the window has run out with no admin confirmed", async () => {
    openConfirmationWindow(ROBOT_ID, null, Date.now() - CONFIRMATION_WINDOW_MS - 1000); // already expired
    recognizeMock.mockResolvedValue({ personId: "guest-1", name: "Guest", category: "GUEST", confidence: 1, status: "CONFIRMED", skipReason: null });

    const brain = new BrainOrchestrator();
    const result = await brain.observeAndReact(await personFrame(), ROBOT_ID);

    expect(safetyManager.isEmergencyActive()).toBe(false);
    expect(isConfirmationPending(ROBOT_ID)).toBe(false);
    const spoke = result.commandResults.some((c) => c.type === "AUDIO_SPEAK");
    expect(spoke).toBe(true);
  }, 15_000);

  it("only speaks the timeout line once, not on every cycle after it's expired", async () => {
    openConfirmationWindow(ROBOT_ID, null, Date.now() - CONFIRMATION_WINDOW_MS - 1000);
    recognizeMock.mockResolvedValue({ personId: "guest-1", name: "Guest", category: "GUEST", confidence: 1, status: "CONFIRMED", skipReason: null });

    const brain = new BrainOrchestrator();
    await brain.observeAndReact(await personFrame(), ROBOT_ID); // fires the timeout message, clears state
    const second = await brain.observeAndReact(await personFrame(), ROBOT_ID); // nothing pending anymore

    const spokeAgain = second.commandResults.some((c) => c.type === "AUDIO_SPEAK" && (c as { text?: string }).text?.includes("couldn't confirm"));
    expect(spokeAgain).toBe(false);
  }, 20_000);
});
