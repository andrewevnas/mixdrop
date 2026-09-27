import "server-only";

import type { NextResponse } from "next/server";

import { jsonError } from "@/server/auth/api";
import { FileNotFoundError, InvalidSignRequestError, UploadNotAllowedError } from "@/server/data/files";
import { InvalidPathError } from "@/server/storage/paths";

/** Map known file-domain errors to JSON responses; rethrow anything else (→ 500, logged by Next). */
export function fileErrorResponse(e: unknown): NextResponse {
  if (e instanceof FileNotFoundError) return jsonError(404, "Not found");
  if (e instanceof UploadNotAllowedError) return jsonError(409, e.message);
  if (e instanceof InvalidPathError) return jsonError(400, `Invalid file path: ${e.message}`);
  if (e instanceof InvalidSignRequestError) return jsonError(400, "Invalid upload request");
  throw e;
}
