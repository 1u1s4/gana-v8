import { z } from "zod";

import { idSchema, isoDateSchema } from "./shared.js";

export const aiRunStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
]);

export const aiRunUsageSchema = z.object({
  promptTokens: z.number().int().min(0),
  completionTokens: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
});

export const aiRunSchema = z.object({
  id: idSchema,
  taskId: idSchema,
  provider: z.string().min(1),
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  status: aiRunStatusSchema,
  usage: aiRunUsageSchema.optional(),
  outputRef: z.string().min(1).optional(),
  error: z.string().optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export type AiRunContract = z.infer<typeof aiRunSchema>;
