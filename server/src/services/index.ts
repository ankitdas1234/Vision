// Cross-cutting service composition root, re-exporting singletons used by routes/tests.
export { commandRegistry } from "../commands/CommandRegistry";
export { memoryManager } from "../memory/MemoryManager";
export { brainOrchestrator } from "../brain/BrainOrchestrator";
export { taskManager } from "../tasks/TaskManager";
