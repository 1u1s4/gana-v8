import { z } from "zod";

import {
  environmentSchema,
  idSchema,
  isoDateSchema,
  metadataSchema,
} from "./shared.js";

export const sandboxNamespaceSchema = z
  .object({
    id: idSchema,
    environment: environmentSchema,
    sandboxId: idSchema.optional(),
    scope: z.string().min(1),
    storagePrefix: z.string().min(1),
    queuePrefix: z.string().min(1),
    metadata: metadataSchema,
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
  })
  .superRefine((value, ctx) => {
    if (value.environment === "sandbox" && !value.sandboxId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "sandboxId is required for sandbox namespaces",
        path: ["sandboxId"],
      });
    }
  });

export type SandboxNamespaceContract = z.infer<typeof sandboxNamespaceSchema>;
