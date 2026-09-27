import { NextResponse } from "next/server";
import { z } from "zod";

import { apiCaller, jsonError } from "@/server/auth/api";
import { completeUpload } from "@/server/data/files";
import { fileErrorResponse } from "@/server/files/api-errors";

/** Mark an upload complete after verifying the object's size in R2. */
export async function POST(request: Request, ctx: RouteContext<"/api/uploads/[fileId]/complete">) {
  const caller = await apiCaller(request);
  if (caller instanceof NextResponse) return caller;

  const fileId = z.uuid().safeParse((await ctx.params).fileId);
  if (!fileId.success) return jsonError(400, "Invalid request");

  try {
    const status = await completeUpload(caller.userId, fileId.data);
    return NextResponse.json({ status }, { status: status === "complete" ? 200 : 422 });
  } catch (e) {
    return fileErrorResponse(e);
  }
}
