import { taskManager } from "./TaskManager";

/** Simple priority-ordered in-memory scheduler; swap for a durable queue (e.g. BullMQ) at scale. */
export class TaskScheduler {
  async runNext() {
    const pending = taskManager.list().filter((t) => t.status === "PENDING").sort((a, b) => b.priority - a.priority);
    const next = pending[0];
    if (!next) return null;
    taskManager.updateStatus(next.id, "RUNNING");
    return next;
  }
}

export const taskScheduler = new TaskScheduler();
