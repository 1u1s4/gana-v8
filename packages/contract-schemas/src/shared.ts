import { z } from "zod";

export const isoDateSchema = z.string().datetime();
export const idSchema = z.string().min(1);
export const environmentSchema = z.enum(["prod", "staging", "sandbox"]);
export const metadataSchema = z.record(z.string(), z.string());
