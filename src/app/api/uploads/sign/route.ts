import { NextResponse } from "next/server";

import { apiCaller, jsonError, readJson } from "@/server/auth/api";
import { signUploadRequest } from "@/server/data/files";
import { fileErrorResponse } from "@/server/files/api-errors";
import { toSignRequest } from "@/server/storage/sign-request";

/** Uppy's signRequest callback: presign one multipart operation on the caller's own pending upload. */
export async function POST(request: Request) {
  const caller = await apiCaller(request);
  if (caller instanceof NextResponse) return caller;

  const req = toSignRequest(await readJson(request));
  if (!req) return jsonError(400, "Unsupported request");

  try {
    return NextResponse.json(await signUploadRequest(caller.userId, req));
  } catch (e) {
    return fileErrorResponse(e);
  }
}
