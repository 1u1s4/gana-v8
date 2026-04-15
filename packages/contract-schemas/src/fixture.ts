import { z } from "zod";

import { idSchema, isoDateSchema, metadataSchema } from "./shared.js";

export const fixtureStatusSchema = z.enum([
  "scheduled",
  "live",
  "completed",
  "cancelled",
]);

export const fixtureScoreSchema = z.object({
  home: z.number().int().min(0),
  away: z.number().int().min(0),
});

export const fixtureSchema = z.object({
  id: idSchema,
  sport: z.string().min(1),
  competition: z.string().min(1),
  homeTeam: z.string().min(1),
  awayTeam: z.string().min(1),
  scheduledAt: isoDateSchema,
  status: fixtureStatusSchema,
  score: fixtureScoreSchema.optional(),
  metadata: metadataSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export type FixtureContract = z.infer<typeof fixtureSchema>;
