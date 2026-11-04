import { memoryRepository } from "../../repositories/memory.repository";
import { STATIC_SAFETY_RULES } from "../../memory/static/staticRules";

/**
 * Seeds (or re-seeds) Vision's static memory. Uses upsert-by-memoryKey
 * (repositories/memory.repository.ts's static.upsert()) rather than a
 * raw multi-row insert, so running this a second time — after a hardware
 * change like the servo layout going from 4 servos to 3, for instance — updates the existing
 * rows instead of crashing on memoryKey's unique constraint. Actually
 * reaches the running server now too: memory/MemoryPersistence.ts loads
 * every row here into the live MemoryManager at startup, which didn't
 * happen before — these facts used to sit in the database unused.
 */
export async function seedStaticMemory() {
  const records = [
    { memoryKey: "vision.identity", memoryType: "IDENTITY", title: "Vision's identity", content: "Vision is an intelligent physical robot with an ESP32-CAM, a PCA9685 driver, and 3 servos: a head servo that turns 180° like a human head (camera + ultrasonic ride on it) and one servo for each leg.", importance: 1 },
    { memoryKey: "vision.hardware", memoryType: "HARDWARE", title: "Vision's hardware", content: "1x ESP32-CAM, 1x PCA9685, exactly 3 servos (CH0 head 0-180°, CH1 left leg, CH2 right leg). Camera and ultrasonic ride on the head servo. No ESP32 DevKit. No TT gear.", importance: 1 },
    ...STATIC_SAFETY_RULES.map((rule, i) => ({
      memoryKey: `vision.safety.rule.${i + 1}`, memoryType: "SAFETY", title: `Safety rule ${i + 1}`, content: rule, importance: 1,
    })),
  ];
  for (const record of records) {
    await memoryRepository.static.upsert(record);
  }
}
