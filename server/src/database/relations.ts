import { relations } from "drizzle-orm";
import { robots, people, observations, tasks, dynamicMemories, commandHistory } from "./schema";

export const robotsRelations = relations(robots, ({ many }) => ({
  observations: many(observations),
  tasks: many(tasks),
  commandHistory: many(commandHistory),
}));

export const peopleRelations = relations(people, ({ many }) => ({
  observations: many(observations),
  dynamicMemories: many(dynamicMemories),
}));

export const observationsRelations = relations(observations, ({ one }) => ({
  robot: one(robots, { fields: [observations.robotId], references: [robots.id] }),
  person: one(people, { fields: [observations.personId], references: [people.id] }),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  robot: one(robots, { fields: [tasks.robotId], references: [robots.id] }),
  person: one(people, { fields: [tasks.personId], references: [people.id] }),
}));
