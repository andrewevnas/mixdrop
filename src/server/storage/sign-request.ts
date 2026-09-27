import { z } from "zod";

import type { SignRequest } from "@/server/data/files";

import { MAX_PARTS } from "./paths";

// Uppy (@uppy/aws-s3 v6) asks us to presign raw S3 requests: { method, key, uploadId?, partNumber? }.
// Allowed: single PUT (small files) and the multipart operations. DeleteObject/GetObject are refused.

const uppyRequestSchema = z.object({
  method: z.enum(["GET", "PUT", "POST", "DELETE"]),
  key: z.string().min(1).max(1024),
  uploadId: z.string().min(1).max(1024).optional(),
  partNumber: z.number().int().min(1).max(MAX_PARTS).optional(),
});

export function toSignRequest(body: unknown): SignRequest | null {
  const parsed = uppyRequestSchema.safeParse(body);
  if (!parsed.success) return null;
  const { method, key, uploadId, partNumber } = parsed.data;

  if (!uploadId) {
    if (partNumber !== undefined) return null;
    if (method === "POST") return { op: "createMultipart", key };
    if (method === "PUT") return { op: "putObject", key };
    return null;
  }
  switch (method) {
    case "PUT":
      return partNumber === undefined ? null : { op: "uploadPart", key, uploadId, partNumber };
    case "GET":
      return partNumber === undefined ? { op: "listParts", key, uploadId } : null;
    case "POST":
      return partNumber === undefined ? { op: "completeMultipart", key, uploadId } : null;
    case "DELETE":
      return partNumber === undefined ? { op: "abortMultipart", key, uploadId } : null;
  }
}
