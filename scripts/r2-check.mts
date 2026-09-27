// Verifies the R2 bucket supports the exact presigned multipart flow the uploader uses
// (including presigned POST for create/complete). Prints statuses only, never credentials.
// Usage: pnpm r2:check
import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
  console.error("✗ R2_* env vars missing in .env.local");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
const Bucket = R2_BUCKET;
const Key = `r2-check/${Date.now()}.bin`;
const ttl = { expiresIn: 300 };

function step(ok: boolean, label: string, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exit(1);
}

const createUrl = await getSignedUrl(
  client,
  new CreateMultipartUploadCommand({ Bucket, Key, ContentType: "application/octet-stream" }),
  ttl,
);
const created = await fetch(createUrl, { method: "POST", headers: { "Content-Type": "application/octet-stream" } });
const uploadId = (await created.text()).match(/<UploadId>([^<]+)<\/UploadId>/)?.[1];
step(created.ok && !!uploadId, "presigned POST CreateMultipartUpload", `HTTP ${created.status}`);

const body = new TextEncoder().encode("mixdrop r2 check");
const partUrl = await getSignedUrl(client, new UploadPartCommand({ Bucket, Key, UploadId: uploadId, PartNumber: 1 }), ttl);
const part = await fetch(partUrl, { method: "PUT", body });
const etag = part.headers.get("etag");
step(part.ok && !!etag, "presigned PUT UploadPart", `HTTP ${part.status}`);

const listUrl = await getSignedUrl(client, new ListPartsCommand({ Bucket, Key, UploadId: uploadId }), ttl);
const listed = await fetch(listUrl);
step(listed.ok && (await listed.text()).includes("<PartNumber>1</PartNumber>"), "presigned GET ListParts", `HTTP ${listed.status}`);

const completeUrl = await getSignedUrl(client, new CompleteMultipartUploadCommand({ Bucket, Key, UploadId: uploadId }), ttl);
const completed = await fetch(completeUrl, {
  method: "POST",
  headers: { "Content-Type": "application/xml" },
  body: `<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>${etag}</ETag></Part></CompleteMultipartUpload>`,
});
step(completed.ok, "presigned POST CompleteMultipartUpload", `HTTP ${completed.status}`);

const head = await client.send(new HeadObjectCommand({ Bucket, Key }));
step(head.ContentLength === body.byteLength, "object stored with the right size", `${head.ContentLength} bytes`);

await client.send(new DeleteObjectCommand({ Bucket, Key }));

// Small files: single PUT whose URL signs the exact Content-Length.
const smallKey = `${Key}.small`;
const putUrl = await getSignedUrl(
  client,
  new PutObjectCommand({ Bucket, Key: smallKey, ContentLength: body.byteLength, ContentType: "application/octet-stream" }),
  { ...ttl, signableHeaders: new Set(["content-length", "content-type"]) },
);
const bigger = await fetch(putUrl, {
  method: "PUT",
  headers: { "Content-Type": "application/octet-stream" },
  body: new Uint8Array(body.byteLength + 1000),
});
step(!bigger.ok, "presigned PUT rejects a body of the wrong size", `HTTP ${bigger.status}`);
const exact = await fetch(putUrl, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body });
step(exact.ok, "presigned PUT accepts the declared size", `HTTP ${exact.status}`);
await client.send(new DeleteObjectCommand({ Bucket, Key: smallKey }));

console.log("✓ cleaned up. R2 supports the uploader's presigned flows.");
