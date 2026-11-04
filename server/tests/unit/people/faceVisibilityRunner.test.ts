import { describe, it, expect, vi, beforeEach } from "vitest";

// Same rationale as tests/unit/curiosity/explorationController.test.ts:
// CommandRegistry transitively pulls in the native face/object-recognition
// chain, which this sandbox can't load — mocked so this test actually
// exercises the sequencing logic instead of failing to import at all.
const dispatchMock = vi.fn().mockResolvedValue({ success: true });
vi.mock("../../../src/commands/CommandRegistry", () => ({
  commandRegistry: { dispatch: (...args: unknown[]) => dispatchMock(...args) },
}));

const readMock = vi.fn();
vi.mock("../../../src/ultrasonic/UltrasonicController", () => ({
  ultrasonicController: { read: () => readMock() },
}));

import { runFaceVisibilitySequence, TURN_AROUND_MS, BACK_AWAY_WALK_MS } from "../../../src/people/FaceVisibilityRunner";
import { resetFaceVisibilityState } from "../../../src/people/FaceVisibilityAssistance";

const ROBOT = "vision-test";

function dispatchedTypes(): string[] {
  return dispatchMock.mock.calls.map((call) => (call[0] as { type: string }).type);
}

describe("runFaceVisibilitySequence", () => {
  beforeEach(() => {
    dispatchMock.mockClear();
    readMock.mockReset();
    resetFaceVisibilityState();
  });

  it("turns to check behind, turns back, backs away, then asks — when the space behind is clear", async () => {
    readMock.mockReturnValue({ status: "CLEAR" });

    await runFaceVisibilitySequence(ROBOT);

    expect(dispatchedTypes()).toEqual(["TURN_RIGHT", "TURN_LEFT", "WALK_BACKWARD", "WALK_STOP", "AUDIO_SPEAK"]);

    const turnRightCall = dispatchMock.mock.calls[0][0] as { params: { durationMs: number } };
    expect(turnRightCall.params.durationMs).toBe(TURN_AROUND_MS);
    const walkCall = dispatchMock.mock.calls[2][0] as { params: { durationMs: number } };
    expect(walkCall.params.durationMs).toBe(BACK_AWAY_WALK_MS);

    const speakCall = dispatchMock.mock.calls[4][0] as { params: { text: string } };
    expect(speakCall.params.text.toLowerCase()).toContain("closer");
  });

  it("does NOT back away when the space behind is not clear — just turns back and asks", async () => {
    readMock.mockReturnValue({ status: "OBSTACLE" });

    await runFaceVisibilitySequence(ROBOT);

    expect(dispatchedTypes()).toEqual(["TURN_RIGHT", "TURN_LEFT", "AUDIO_SPEAK"]);
  });

  it("treats NEAR as safe enough to back into (same bar as movement safety elsewhere)", async () => {
    readMock.mockReturnValue({ status: "NEAR" });
    await runFaceVisibilitySequence(ROBOT);
    expect(dispatchedTypes()).toContain("WALK_BACKWARD");
  });

  it("treats VERY_CLOSE as unsafe to back into", async () => {
    readMock.mockReturnValue({ status: "VERY_CLOSE" });
    await runFaceVisibilitySequence(ROBOT);
    expect(dispatchedTypes()).not.toContain("WALK_BACKWARD");
  });

  it("words the second attempt differently from the first", async () => {
    readMock.mockReturnValue({ status: "CLEAR" });

    await runFaceVisibilitySequence(ROBOT);
    const firstText = (dispatchMock.mock.calls.at(-1)![0] as { params: { text: string } }).params.text;

    dispatchMock.mockClear();
    await runFaceVisibilitySequence(ROBOT);
    const secondText = (dispatchMock.mock.calls.at(-1)![0] as { params: { text: string } }).params.text;

    expect(firstText).not.toBe(secondText);
  });

  it("never throws even if a command dispatch fails partway through", async () => {
    readMock.mockReturnValue({ status: "CLEAR" });
    dispatchMock.mockRejectedValueOnce(new Error("robot offline"));

    await expect(runFaceVisibilitySequence(ROBOT)).resolves.toBeUndefined();
  });
});
