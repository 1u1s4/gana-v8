import { z } from "zod";

import { idSchema, isoDateSchema } from "./shared.js";

export const validationStatusSchema = z.enum([
  "pending",
  "passed",
  "failed",
  "partial",
]);
export const validationKindSchema = z.enum([
  "fixture-result",
  "prediction-settlement",
  "parlay-settlement",
  "sandbox-regression",
]);

export const validationCheckSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  passed: z.boolean(),
});

export const validationSchema = z.object({
  id: idSchema,
  targetId: idSchema,
  kind: validationKindSchema,
  status: validationStatusSchema,
  checks: z.array(validationCheckSchema),
  summary: z.string(),
  executedAt: isoDateSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export type ValidationContract = z.infer<typeof validationSchema>;
