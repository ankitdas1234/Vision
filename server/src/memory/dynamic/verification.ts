import type { VerificationStatus } from "../../packages/types";

/** Decide the initial verification status for a newly learned fact based on source + confidence. */
export function initialVerificationStatus(source: string, confidence: number): VerificationStatus {
  if (source === "ADMIN") return "VERIFIED";
  if (confidence >= 0.85) return "UNVERIFIED"; // still needs human/behavioral confirmation
  if (confidence >= 0.5) return "REQUIRES_REVIEW";
  return "REJECTED";
}
