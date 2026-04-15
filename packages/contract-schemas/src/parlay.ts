import { z } from "zod";

import { idSchema, isoDateSchema } from "./shared.js";

export const parlayStatusSchema = z.enum([
  "draft",
  "ready",
  "submitted",
  "settled",
  "voided",
]);
export const parlayLegStatusSchema = z.enum([
  "pending",
  "won",
  "lost",
  "voided",
]);

export const parlayLegSchema = z.object({
  predictionId: idSchema,
  fixtureId: idSchema,
  market: z.string().min(1),
  outcome: z.string().min(1),
  price: z.number().positive(),
  status: parlayLegStatusSchema,
});

export const parlaySchema = z.object({
  id: idSchema,
  status: parlayStatusSchema,
  stake: z.number().positive(),
  source: z.enum(["manual", "automatic"]),
  legs: z.array(parlayLegSchema).min(1),
  correlationScore: z.number().min(0),
  expectedPayout: z.number().positive(),
  submittedAt: isoDateSchema.optional(),
  settledAt: isoDateSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export type ParlayContract = z.infer<typeof parlaySchema>;
