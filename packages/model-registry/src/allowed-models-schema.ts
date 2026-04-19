import { z } from "zod";

import { ALLOWED_CODEX_MODEL_IDS } from "./allowed-models.js";

export const allowedAiModelSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.enum(ALLOWED_CODEX_MODEL_IDS),
);

export const optionalAllowedAiModelSchema = allowedAiModelSchema.optional();
