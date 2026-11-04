import type { MemorySource, MentalState } from "../packages/types";

export interface DecisionInput {
  observationId: string;
  memorySource: MemorySource;
  memoryConfidence: number;
  mentalState: MentalState;
  personDetected: boolean;
}

export interface Decision {
  observationId: string;
  decision: "TRACK_PERSON" | "INVESTIGATE" | "LEARN" | "GREET" | "OBSERVE_ONLY" | "IGNORE";
  reason: string;
  confidence: number;
}
