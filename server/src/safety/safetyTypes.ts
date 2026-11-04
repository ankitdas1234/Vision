export interface SafetyEvent {
  id: string;
  robotId: string;
  eventType: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  description: string;
  actionTaken: string;
  resolved: boolean;
  createdAt: string;
}
