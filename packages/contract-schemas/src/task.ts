import { z } from "zod";

import { idSchema, isoDateSchema } from "./shared.js";

export const taskKindSchema = z.enum([
  "fixture-ingestion",
  "odds-ingestion",
  "research",
  "prediction",
  "validation",
  "sandbox-replay",
]);
export const taskStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

export const taskAttemptSchema = z.object({
  startedAt: isoDateSchema,
  finishedAt: isoDateSchema.optional(),
  error: z.string().optional(),
});

export const taskSchema = z.object({
  id: idSchema,
  kind: taskKindSchema,
  status: taskStatusSchema,
  priority: z.number().int().min(0),
  payload: z.record(z.string(), z.unknown()),
  attempts: z.array(taskAttemptSchema),
  scheduledFor: isoDateSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export type TaskContract = z.infer<typeof taskSchema>;
