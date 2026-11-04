import { describe, it, expect, beforeEach } from "vitest";
import {
  noteAdminVoiceConfirmed,
  noteAdminFaceConfirmed,
  isAdminPresent,
  activeAdminSignals,
  resetAdminPresence,
  ADMIN_PRESENCE_WINDOW_MS,
} from "../../../src/people/AdminPresence";

const ROBOT = "vision-admin-presence-test";

describe("AdminPresence", () => {
  beforeEach(() => resetAdminPresence());

  it("nobody is present by default", () => {
    expect(isAdminPresent(ROBOT)).toBe(false);
    expect(activeAdminSignals(ROBOT)).toEqual([]);
  });

  it("voice confirmation alone is enough", () => {
    noteAdminVoiceConfirmed(ROBOT, 1000);
    expect(isAdminPresent(ROBOT, 1000)).toBe(true);
    expect(activeAdminSignals(ROBOT, 1000)).toEqual(["VOICE"]);
  });

  it("face confirmation alone is enough", () => {
    noteAdminFaceConfirmed(ROBOT, 1000);
    expect(isAdminPresent(ROBOT, 1000)).toBe(true);
    expect(activeAdminSignals(ROBOT, 1000)).toEqual(["FACE"]);
  });

  it("both signals can be active at once", () => {
    noteAdminVoiceConfirmed(ROBOT, 1000);
    noteAdminFaceConfirmed(ROBOT, 1000);
    expect(activeAdminSignals(ROBOT, 1000)).toEqual(["VOICE", "FACE"]);
  });

  it("expires on its own", () => {
    noteAdminVoiceConfirmed(ROBOT, 1000);
    expect(isAdminPresent(ROBOT, 1000 + ADMIN_PRESENCE_WINDOW_MS)).toBe(true);
    expect(isAdminPresent(ROBOT, 1000 + ADMIN_PRESENCE_WINDOW_MS + 1)).toBe(false);
  });

  it("one signal expiring doesn't clear the other", () => {
    noteAdminVoiceConfirmed(ROBOT, 1000);
    noteAdminFaceConfirmed(ROBOT, 1000 + ADMIN_PRESENCE_WINDOW_MS); // face refreshed later
    expect(isAdminPresent(ROBOT, 1000 + ADMIN_PRESENCE_WINDOW_MS + 1)).toBe(true);
    expect(activeAdminSignals(ROBOT, 1000 + ADMIN_PRESENCE_WINDOW_MS + 1)).toEqual(["FACE"]);
  });

  it("keeps robots separate", () => {
    noteAdminVoiceConfirmed(ROBOT, 1000);
    expect(isAdminPresent("vision-other", 1000)).toBe(false);
  });
});
