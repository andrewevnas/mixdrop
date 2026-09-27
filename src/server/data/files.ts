import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { type FileRow, files, type OrderStatus, orders } from "@/db/schema";
import {
  buildObjectKey,
  type FileKind,
  MAX_PARTS,
  partCount,
  quotaError,
  sanitizeRelativePath,
  SINGLE_PUT_MAX_BYTES,
  baseName,
} from "@/server/storage/paths";
import {
  abortAllMultipartUploads,
  abortMultipart,
  deleteObject,
  headObjectSize,
  presign,
  STORED_HEADERS,
} from "@/server/storage/r2";

import { getOrderForParticipant } from "./orders";

// Every function takes the caller's id from the verified session. Uploads: only the order's
// client, only while the order is active. Reads/downloads: participants only, completed files only.

export const UPLOADABLE_STATUSES: readonly OrderStatus[] = ["paid", "accepted", "in_progress", "revision_requested"];

/** upload_id sentinel while completeUpload() verifies a file: no operations can be signed. */
const VERIFYING = "__verifying__";

export class UploadNotAllowedError extends Error {}
export class FileNotFoundError extends Error {
  constructor() {
    super("File not found");
  }
}

export type RegisterUploadInput = {
  kind: FileKind;
  relativePath: string;
  sizeBytes: number;
  mime: string;
};

export type RegisteredUpload = { fileId: string; key: string; status: "pending" | "complete" };

/**
 * Reserve a file row and object key for an upload. Idempotent: re-adding the same file
 * (same path, size and kind) returns the existing row, so refreshed/resumed uploads reuse
 * their key and completed files are skipped.
 */
export async function registerUpload(
  userId: string,
  orderId: string,
  input: RegisterUploadInput,
): Promise<RegisteredUpload> {
  const relativePath = sanitizeRelativePath(input.relativePath);

  return db.transaction(async (tx) => {
    // Lock the order so concurrent registrations can't race past the quota.
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order || order.clientId !== userId) throw new FileNotFoundError();
    if (!UPLOADABLE_STATUSES.includes(order.status)) {
      throw new UploadNotAllowedError("Files can be added once the order is paid and until it's delivered.");
    }

    const [existing] = await tx
      .select()
      .from(files)
      .where(
        and(
          eq(files.orderId, orderId),
          eq(files.uploaderId, userId),
          eq(files.kind, input.kind),
          eq(files.relativePath, relativePath),
          eq(files.sizeBytes, input.sizeBytes),
          ne(files.status, "failed"),
        ),
      )
      .limit(1);
    if (existing) {
      return { fileId: existing.id, key: existing.r2Key, status: existing.status as "pending" | "complete" };
    }

    const [usage] = await tx
      .select({
        files: sql<number>`count(*)::int`,
        bytes: sql<number>`coalesce(sum(${files.sizeBytes}), 0)::bigint`,
      })
      .from(files)
      .where(and(eq(files.orderId, orderId), ne(files.status, "failed")));
    const problem = quotaError({ files: usage.files, bytes: Number(usage.bytes) }, input.sizeBytes);
    if (problem) throw new UploadNotAllowedError(problem);

    const fileId = randomUUID();
    const name = baseName(relativePath);
    const key = buildObjectKey(orderId, input.kind, fileId, name);
    await tx.insert(files).values({
      id: fileId,
      orderId,
      uploaderId: userId,
      kind: input.kind,
      r2Key: key,
      relativePath,
      originalName: name,
      sizeBytes: input.sizeBytes,
      mime: input.mime.slice(0, 255) || "application/octet-stream",
    });
    return { fileId, key, status: "pending" };
  });
}

/** An S3 request Uppy wants signed (see @uppy/aws-s3 PresignableRequest). */
export type SignRequest =
  | { op: "putObject"; key: string }
  | { op: "createMultipart"; key: string }
  | { op: "uploadPart"; key: string; uploadId: string; partNumber: number }
  | { op: "listParts"; key: string; uploadId: string }
  | { op: "completeMultipart"; key: string; uploadId: string }
  | { op: "abortMultipart"; key: string; uploadId: string };

export class InvalidSignRequestError extends Error {}

/**
 * Sign one multipart operation, only for the caller's own pending upload on an order that still
 * accepts uploads. The multipart upload id is bound to the row on first use; requests for any
 * other upload id on that key are refused.
 */
export async function signUploadRequest(
  userId: string,
  req: SignRequest,
): Promise<{ url: string; headers?: Record<string, string> }> {
  const [file] = await db
    .select({ file: files, orderStatus: orders.status })
    .from(files)
    .innerJoin(orders, eq(orders.id, files.orderId))
    .where(and(eq(files.r2Key, req.key), eq(files.uploaderId, userId), eq(files.status, "pending")))
    .limit(1);
  if (!file) throw new FileNotFoundError();
  if (!UPLOADABLE_STATUSES.includes(file.orderStatus)) throw new UploadNotAllowedError("Order no longer accepts uploads.");
  const row = file.file;

  if (row.uploadId === VERIFYING) throw new InvalidSignRequestError("Upload is being verified");

  if (req.op === "putObject") {
    // Small files only, and never alongside a multipart upload. The URL signs the exact
    // Content-Length, so R2 rejects a body of any other size.
    if (row.sizeBytes > SINGLE_PUT_MAX_BYTES) throw new InvalidSignRequestError("File too large for a single upload");
    if (row.uploadId) throw new InvalidSignRequestError("File has a multipart upload in progress");
    return { url: await presign.putObject(row.r2Key, row.sizeBytes), headers: { ...STORED_HEADERS } };
  }

  if (req.op === "createMultipart") {
    // Starting over: abort the previous multipart upload server-side so it can never complete
    // onto this key later, then unbind (only if nobody rebound it meanwhile).
    if (row.uploadId) await abortMultipart(row.r2Key, row.uploadId);
    const [reset] = await db
      .update(files)
      .set({ uploadId: null })
      .where(and(eq(files.id, row.id), row.uploadId ? eq(files.uploadId, row.uploadId) : isNull(files.uploadId)))
      .returning({ id: files.id });
    if (!reset) throw new InvalidSignRequestError("Upload changed concurrently");
    return { url: await presign.createMultipart(row.r2Key), headers: { ...STORED_HEADERS } };
  }

  if (req.uploadId === VERIFYING) throw new InvalidSignRequestError("Invalid upload id");
  await bindUploadId(row, req.uploadId);
  switch (req.op) {
    case "uploadPart":
      if (req.partNumber < 1 || req.partNumber > Math.min(MAX_PARTS, partCount(row.sizeBytes))) {
        throw new InvalidSignRequestError("Part number out of range");
      }
      return { url: await presign.uploadPart(row.r2Key, req.uploadId, req.partNumber) };
    case "listParts":
      return { url: await presign.listParts(row.r2Key, req.uploadId) };
    case "completeMultipart":
      return { url: await presign.completeMultipart(row.r2Key, req.uploadId) };
    case "abortMultipart":
      return { url: await presign.abortMultipart(row.r2Key, req.uploadId) };
  }
}

async function bindUploadId(row: FileRow, uploadId: string): Promise<void> {
  const [bound] = await db
    .update(files)
    .set({ uploadId })
    .where(and(eq(files.id, row.id), or(isNull(files.uploadId), eq(files.uploadId, uploadId))))
    .returning({ id: files.id });
  if (!bound) throw new InvalidSignRequestError("Upload id does not match this file");
}

/**
 * Called after the browser completes the multipart upload. Verifies the stored object's size
 * against what was declared at registration; a mismatch deletes the object and fails the row.
 *
 * Order matters: (1) lock the row so no further operations can be signed for it, (2) abort any
 * other multipart upload on the key, so nothing can complete onto it after the check, (3) HEAD.
 */
export async function completeUpload(userId: string, fileId: string): Promise<"complete" | "failed"> {
  const [found] = await db
    .select({ file: files, orderStatus: orders.status })
    .from(files)
    .innerJoin(orders, eq(orders.id, files.orderId))
    .where(and(eq(files.id, fileId), eq(files.uploaderId, userId)))
    .limit(1);
  if (!found) throw new FileNotFoundError();
  const row = found.file;
  if (row.status !== "pending") return row.status;
  if (!UPLOADABLE_STATUSES.includes(found.orderStatus)) throw new UploadNotAllowedError("Order no longer accepts uploads.");

  const [locked] = await db
    .update(files)
    .set({ uploadId: VERIFYING })
    .where(and(eq(files.id, row.id), eq(files.status, "pending"), or(isNull(files.uploadId), ne(files.uploadId, VERIFYING))))
    .returning({ id: files.id });
  if (!locked) throw new UploadNotAllowedError("This file is already being verified.");

  try {
    await abortAllMultipartUploads(row.r2Key);
    const actual = await headObjectSize(row.r2Key);
    const ok = actual === row.sizeBytes;
    if (!ok && actual !== null) await deleteObject(row.r2Key);
    await db
      .update(files)
      .set({ status: ok ? "complete" : "failed", uploadId: null })
      .where(eq(files.id, row.id));
    return ok ? "complete" : "failed";
  } catch (e) {
    // Unlock so the client can retry; nothing was marked complete.
    await db.update(files).set({ uploadId: null }).where(and(eq(files.id, row.id), eq(files.uploadId, VERIFYING)));
    throw e;
  }
}

/** Public-safe view of a file (no key, no upload id). */
export type OrderFile = Pick<FileRow, "id" | "kind" | "relativePath" | "originalName" | "sizeBytes" | "status" | "createdAt">;

/** Files on an order the caller participates in. Pending/failed files are only shown to their uploader. */
export async function listOrderFiles(userId: string, orderId: string): Promise<OrderFile[]> {
  if (!(await getOrderForParticipant(userId, orderId))) return [];
  return db
    .select({
      id: files.id,
      kind: files.kind,
      relativePath: files.relativePath,
      originalName: files.originalName,
      sizeBytes: files.sizeBytes,
      status: files.status,
      createdAt: files.createdAt,
    })
    .from(files)
    .where(and(eq(files.orderId, orderId), or(eq(files.status, "complete"), eq(files.uploaderId, userId))))
    .orderBy(asc(files.relativePath));
}

export const MAX_DOWNLOAD_BATCH = 100;

export type DownloadUrl = { id: string; relativePath: string; sizeBytes: number; url: string };

/** Short-lived attachment URLs for completed files on an order the caller participates in. */
export async function getDownloadUrls(userId: string, orderId: string, fileIds: string[]): Promise<DownloadUrl[]> {
  if (fileIds.length === 0) return [];
  if (fileIds.length > MAX_DOWNLOAD_BATCH) throw new InvalidSignRequestError("Too many files in one batch");
  if (!(await getOrderForParticipant(userId, orderId))) throw new FileNotFoundError();

  const rows = await db
    .select()
    .from(files)
    .where(and(eq(files.orderId, orderId), eq(files.status, "complete"), inArray(files.id, fileIds)));
  return Promise.all(
    rows.map(async (f) => ({
      id: f.id,
      relativePath: f.relativePath,
      sizeBytes: f.sizeBytes,
      url: await presign.download(f.r2Key, f.originalName),
    })),
  );
}
