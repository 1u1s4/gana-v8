import { z } from "zod";

import { idSchema, isoDateSchema } from "./shared.js";

export const predictionStatusSchema = z.enum([
  "draft",
  "published",
  "settled",
  "voided",
]);
export const predictionMarketSchema = z.enum([
  "moneyline",
  "totals",
  "spread",
  "both-teams-score",
  "double-chance",
]);
export const predictionOutcomeSchema = z.enum([
  "home",
  "away",
  "draw",
  "over",
  "under",
  "yes",
  "no",
  "home-draw",
  "home-away",
  "draw-away",
]);

export const probabilityBreakdownSchema = z.object({
  implied: z.number().min(0).max(1),
  model: z.number().min(0).max(1),
  edge: z.number(),
  line: z.number().optional(),
});

export const predictionSchema = z.object({
  id: idSchema,
  fixtureId: idSchema,
  aiRunId: idSchema.optional(),
  market: predictionMarketSchema,
  outcome: predictionOutcomeSchema,
  status: predictionStatusSchema,
  confidence: z.number().min(0).max(1),
  probabilities: probabilityBreakdownSchema,
  rationale: z.array(z.string().min(1)).min(1),
  publishedAt: isoDateSchema.optional(),
  settledAt: isoDateSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export type PredictionContract = z.infer<typeof predictionSchema>;
