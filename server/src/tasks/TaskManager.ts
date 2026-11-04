import type { Task, TaskStatus } from "./taskTypes";

export class TaskManager {
  private tasks = new Map<string, Task>();

  create(input: { robotId: string; taskType: string; input?: Record<string, unknown>; priority?: number; description?: string; personId?: string }): Task {
    const task: Task = {
      id: crypto.randomUUID(),
      robotId: input.robotId,
      personId: input.personId,
      taskType: input.taskType,
      status: "PENDING",
      priority: input.priority ?? 1,
      description: input.description,
      input: input.input,
      createdAt: new Date().toISOString(),
    };
    this.tasks.set(task.id, task);
    return task;
  }

  updateStatus(id: string, status: TaskStatus, patch: Partial<Task> = {}) {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    Object.assign(task, { status, ...patch });
    if (status === "RUNNING" && !task.startedAt) task.startedAt = new Date().toISOString();
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(status)) task.completedAt = new Date().toISOString();
    return task;
  }

  cancel(id: string) { return this.updateStatus(id, "CANCELLED"); }
  get(id: string) { return this.tasks.get(id); }
  list() { return [...this.tasks.values()]; }
}

export const taskManager = new TaskManager();
