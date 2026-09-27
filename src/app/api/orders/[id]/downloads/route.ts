import { NextResponse } from "next/server";
import { z } from "zod";

import { apiCaller, jsonError, readJson } from "@/server/auth/api";
import { getDownloadUrls, MAX_DOWNLOAD_BATCH } from "@/server/data/files";
import { fileErrorResponse } from "@/server/files/api-errors";

const bodySchema = z.object({ fileIds: z.array(z.uuid()).min(1).max(MAX_DOWNLOAD_BATCH) });

/** Short-lived download URLs for a batch of completed files (fetched just in time by the downloader). */
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[id]/downloads">) {
  const caller = await apiCaller(request);
  if (caller instanceof NextResponse) return caller;

  const orderId = z.uuid().safeParse((await ctx.params).id);
  const body = bodySchema.safeParse(await readJson(request));
  if (!orderId.success || !body.success) return jsonError(400, "Invalid request");

  try {
    const files = await getDownloadUrls(caller.userId, orderId.data, body.data.fileIds);
    return NextResponse.json({ files }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fileErrorResponse(e);
  }
}
