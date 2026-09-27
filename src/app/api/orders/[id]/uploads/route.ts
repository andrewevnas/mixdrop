import { NextResponse } from "next/server";
import { z } from "zod";

import { apiCaller, jsonError, readJson } from "@/server/auth/api";
import { registerUpload } from "@/server/data/files";
import { fileErrorResponse } from "@/server/files/api-errors";
import { CLIENT_UPLOAD_KINDS, MAX_FILE_BYTES, MAX_RELATIVE_PATH } from "@/server/storage/paths";

const bodySchema = z.object({
  kind: z.enum(CLIENT_UPLOAD_KINDS),
  relativePath: z.string().min(1).max(MAX_RELATIVE_PATH),
  sizeBytes: z.number().int().min(0).max(MAX_FILE_BYTES),
  mime: z.string().max(255),
});

/** Register a file before Uppy uploads it; returns the server-chosen object key. */
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[id]/uploads">) {
  const caller = await apiCaller(request);
  if (caller instanceof NextResponse) return caller;
  if (caller.profile.role !== "client") return jsonError(403, "Only the client can upload files");

  const orderId = z.uuid().safeParse((await ctx.params).id);
  const body = bodySchema.safeParse(await readJson(request));
  if (!orderId.success || !body.success) return jsonError(400, "Invalid request");

  try {
    return NextResponse.json(await registerUpload(caller.userId, orderId.data, body.data));
  } catch (e) {
    return fileErrorResponse(e);
  }
}
