import "server-only";

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// All object access is through short-lived URLs scoped to a single key. File bytes never pass
// through the app server. Callers (src/server/data/files.ts) must authorise before calling these.

/** Rule 8: download URLs expire in <= 15 minutes. Upload URLs use the same cap. */
export const URL_TTL_SECONDS = 15 * 60;

function config() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    throw new Error("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET must be set");
  }
  return {
    bucket: R2_BUCKET,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
      // Presigned URLs must not carry checksum params the browser won't send.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }),
  };
}

let cached: ReturnType<typeof config> | undefined;
const r2 = () => (cached ??= config());

export const isR2Configured = () =>
  !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET);

const ttl = { expiresIn: URL_TTL_SECONDS };

// Stored as opaque bytes; downloads always force attachment, so the type can't make R2 render it.
const STORED_CONTENT_TYPE = "application/octet-stream";

export const presign = {
  /** Single PUT for small files; Content-Length and Content-Type are part of the signature. */
  putObject: (key: string, contentLength: number) =>
    getSignedUrl(
      r2().client,
      new PutObjectCommand({ Bucket: r2().bucket, Key: key, ContentLength: contentLength, ContentType: STORED_CONTENT_TYPE }),
      { ...ttl, signableHeaders: new Set(["content-length", "content-type"]) },
    ),
  createMultipart: (key: string) =>
    getSignedUrl(r2().client, new CreateMultipartUploadCommand({ Bucket: r2().bucket, Key: key, ContentType: STORED_CONTENT_TYPE }), ttl),
  uploadPart: (key: string, uploadId: string, partNumber: number) =>
    getSignedUrl(r2().client, new UploadPartCommand({ Bucket: r2().bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }), ttl),
  listParts: (key: string, uploadId: string) =>
    getSignedUrl(r2().client, new ListPartsCommand({ Bucket: r2().bucket, Key: key, UploadId: uploadId }), ttl),
  completeMultipart: (key: string, uploadId: string) =>
    getSignedUrl(r2().client, new CompleteMultipartUploadCommand({ Bucket: r2().bucket, Key: key, UploadId: uploadId }), ttl),
  abortMultipart: (key: string, uploadId: string) =>
    getSignedUrl(r2().client, new AbortMultipartUploadCommand({ Bucket: r2().bucket, Key: key, UploadId: uploadId }), ttl),
  /** GET with Content-Disposition: attachment so the browser never renders the file inline. */
  download: (key: string, fileName: string) =>
    getSignedUrl(
      r2().client,
      new GetObjectCommand({
        Bucket: r2().bucket,
        Key: key,
        ResponseContentDisposition: contentDisposition(fileName),
        ResponseContentType: STORED_CONTENT_TYPE,
      }),
      ttl,
    ),
};

export const STORED_HEADERS = { "Content-Type": STORED_CONTENT_TYPE } as const;

/** Server-side HEAD: the object's real size, or null if it doesn't exist. */
export async function headObjectSize(key: string): Promise<number | null> {
  try {
    const res = await r2().client.send(new HeadObjectCommand({ Bucket: r2().bucket, Key: key }));
    return res.ContentLength ?? null;
  } catch (e) {
    if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw e;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await r2().client.send(new DeleteObjectCommand({ Bucket: r2().bucket, Key: key }));
}

const isNoSuchUpload = (e: unknown) =>
  (e as { name?: string }).name === "NoSuchUpload" ||
  (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404;

/** Abort one multipart upload; already-finished or unknown uploads are ignored. */
export async function abortMultipart(key: string, uploadId: string): Promise<void> {
  try {
    await r2().client.send(new AbortMultipartUploadCommand({ Bucket: r2().bucket, Key: key, UploadId: uploadId }));
  } catch (e) {
    if (!isNoSuchUpload(e)) throw e;
  }
}

/**
 * Abort every in-progress multipart upload targeting exactly `key`. Called before verifying an
 * upload so no other (possibly oversized) upload can complete onto the key after the check.
 */
export async function abortAllMultipartUploads(key: string): Promise<number> {
  let aborted = 0;
  let keyMarker: string | undefined;
  let uploadIdMarker: string | undefined;
  do {
    const page = await r2().client.send(
      new ListMultipartUploadsCommand({
        Bucket: r2().bucket,
        Prefix: key,
        KeyMarker: keyMarker,
        UploadIdMarker: uploadIdMarker,
      }),
    );
    for (const u of page.Uploads ?? []) {
      if (u.Key === key && u.UploadId) {
        await abortMultipart(key, u.UploadId);
        aborted++;
      }
    }
    keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
    uploadIdMarker = page.IsTruncated ? page.NextUploadIdMarker : undefined;
  } while (keyMarker);
  return aborted;
}

/** RFC 6266 attachment header with an ASCII fallback and a UTF-8 filename*. */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
