export type TaskStatus = "PENDING" | "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface Task {
  id: string;
  robotId: string;
  personId?: string;
  taskType: string;
  status: TaskStatus;
  priority: number;
  description?: string;
  input?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}
