export interface AIRequestLog {
  id: string;
  provider: "openrouter";
  model: string;
  purpose: string;
  inputSummary: string;
  outputSummary: string;
  confidence: number;
  success: boolean;
  latencyMs: number;
  error?: string;
  createdAt: string;
}
