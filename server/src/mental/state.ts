import type { MentalState } from "../packages/types";

export const DEFAULT_MENTAL_STATE: MentalState = {
  mood: "NEUTRAL",
  energy: 80,
  curiosity: 30,
  friendliness: 60,
  alertness: 50,
  confidence: 50,
  intent: "IDLE",
  internalState: "IDLE",
  explorationActive: false,
  currentPersonId: null,
  currentTaskId: null,
};

export function cloneState(state: MentalState): MentalState {
  return { ...state };
}
