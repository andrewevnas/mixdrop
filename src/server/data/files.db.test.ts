import { randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { files, orders, profiles, type Role } from "@/db/schema";
import { transitionOrder } from "@/server/orders/machine";
import { InvalidPathError, MAX_FILE_BYTES, PART_BYTES } from "@/server/storage/paths";

import { createService, saveOwnEngineerProfile } from "./engineers";
import {
  completeUpload,
  FileNotFoundError,
  getDownloadUrls,
  InvalidSignRequestError,
  listOrderFiles,
  registerUpload,
  signUploadRequest,
  UploadNotAllowedError,
} from "./files";
import { createOrder } from "./orders";

// R2 is mocked at the module boundary: these tests cover authorisation and bookkeeping.
const r2 = vi.hoisted(() => ({
  headObjectSize: vi.fn<(key: string) => Promise<number | null>>(),
  deleteObject: vi.fn<(key: string) => Promise<void>>(),
  abortMultipart: vi.fn<(key: string, uploadId: string) => Promise<void>>(),
  abortAllMultipartUploads: vi.fn<(key: string) => Promise<number>>(),
}));
vi.mock("@/server/storage/r2", () => {
  const url = (op: string) => async (key: string, ...rest: unknown[]) =>
    `https://r2.test/${op}/${key}?${rest.join("&")}`;
  return {
    presign: {
      putObject: url("put"),
      createMultipart: url("create"),
      uploadPart: url("part"),
      listParts: url("list"),
      completeMultipart: url("complete"),
      abortMultipart: url("abort"),
      download: url("download"),
    },
    STORED_HEADERS: { "Content-Type": "application/octet-stream" },
    headObjectSize: r2.headObjectSize,
    deleteObject: r2.deleteObject,
    abortMultipart: r2.abortMultipart,
    abortAllMultipartUploads: r2.abortAllMultipartUploads,
    isR2Configured: () => true,
  };
});

const run = randomUUID().slice(0, 8);
const users: string[] = [];
async function makeUser(role: Role, name: string) {
  const id = randomUUID();
  users.push(id);
  await db.execute(sql`insert into auth.users (id, email) values (${id}, ${`${name}-${run}@example.test`})`);
  await db.insert(profiles).values({ id, role, displayName: name });
  return id;
}

let client: string, otherClient: string, engineer: string, otherEngineer: string, serviceId: string;
let paidOrder: string;

async function newOrder(paid = true) {
  const o = await createOrder(client, {
    serviceId,
    songTitle: "Song",
    artistName: "Ana",
    brief: { notes: "", referenceLinks: [] },
    expectedPricePence: 4999,
  });
  if (paid) await transitionOrder(o.id, "paid", { kind: "system" });
  return o.id;
}

const upload = (orderId: string, relativePath = "Session/Audio Files/Kick.wav", sizeBytes = 1000) =>
  registerUpload(client, orderId, { kind: "stems", relativePath, sizeBytes, mime: "audio/wav" });

beforeAll(async () => {
  client = await makeUser("client", "c");
  otherClient = await makeUser("client", "c2");
  engineer = await makeUser("engineer", "e");
  otherEngineer = await makeUser("engineer", "e2");
  await saveOwnEngineerProfile(engineer, { slug: `fe-${run}`, bio: "", genres: [] });
  serviceId = (
    await createService(engineer, { name: "Mix", type: "mix", price: 4999, turnaroundDays: 5, revisionsIncluded: 1, maxStems: 48 })
  ).id;
  paidOrder = await newOrder();
});

beforeEach(() => {
  r2.headObjectSize.mockReset();
  r2.deleteObject.mockReset().mockResolvedValue();
  r2.abortMultipart.mockReset().mockResolvedValue();
  r2.abortAllMultipartUploads.mockReset().mockResolvedValue(0);
});

afterAll(async () => {
  const orderIds = (await db.select({ id: orders.id }).from(orders).where(inArray(orders.clientId, users))).map((o) => o.id);
  if (orderIds.length) await db.delete(files).where(inArray(files.orderId, orderIds));
  await db.delete(orders).where(inArray(orders.clientId, users));
  await db.execute(sql`delete from auth.users where ${inArray(sql`id`, users)}`);
  await (globalThis as { pg?: { end: () => Promise<void> } }).pg?.end();
});

describe("registerUpload", () => {
  it("creates a pending row with a server-built key and sanitised path", async () => {
    const reg = await registerUpload(client, paidOrder, {
      kind: "stems",
      relativePath: "Session\\Audio Files\\Snare 01.wav",
      sizeBytes: 2048,
      mime: "audio/wav",
    });
    expect(reg.status).toBe("pending");
    expect(reg.key).toBe(`orders/${paidOrder}/stems/${reg.fileId}/Snare_01.wav`);
    const [row] = await db.select().from(files).where(eq(files.id, reg.fileId));
    expect(row).toMatchObject({ relativePath: "Session/Audio Files/Snare 01.wav", originalName: "Snare 01.wav", uploaderId: client });
  });

  it("is idempotent for the same path/size/kind (resume after refresh)", async () => {
    const a = await upload(paidOrder, "Session/Audio Files/Bass.wav", 5000);
    const b = await upload(paidOrder, "Session/Audio Files/Bass.wav", 5000);
    expect(b).toEqual(a);
    const c = await upload(paidOrder, "Session/Audio Files/Bass.wav", 5001);
    expect(c.fileId).not.toBe(a.fileId);
  });

  it("reports already-complete files so the client can skip them", async () => {
    const a = await upload(paidOrder, "Session/Done.wav", 10);
    r2.headObjectSize.mockResolvedValue(10);
    await completeUpload(client, a.fileId);
    expect(await upload(paidOrder, "Session/Done.wav", 10)).toEqual({ ...a, status: "complete" });
  });

  it("only the order's client can upload", async () => {
    for (const who of [otherClient, engineer, otherEngineer]) {
      await expect(
        registerUpload(who, paidOrder, { kind: "stems", relativePath: "x.wav", sizeBytes: 1, mime: "" }),
      ).rejects.toBeInstanceOf(FileNotFoundError);
    }
    await expect(upload(randomUUID())).rejects.toBeInstanceOf(FileNotFoundError);
  });

  it("is refused before payment and after delivery-ish states", async () => {
    const draft = await newOrder(false);
    await expect(upload(draft)).rejects.toBeInstanceOf(UploadNotAllowedError);
    const declined = await newOrder();
    await transitionOrder(declined, "declined", { kind: "engineer", userId: engineer });
    await expect(upload(declined)).rejects.toBeInstanceOf(UploadNotAllowedError);
  });

  it("rejects traversal paths and over-quota files", async () => {
    await expect(upload(paidOrder, "../../etc/passwd")).rejects.toBeInstanceOf(InvalidPathError);
    await expect(upload(paidOrder, "big.wav", MAX_FILE_BYTES + 1)).rejects.toBeInstanceOf(UploadNotAllowedError);
    const order = await newOrder();
    await upload(order, "a.wav", MAX_FILE_BYTES);
    await upload(order, "b.wav", MAX_FILE_BYTES);
    await expect(upload(order, "c.wav", 1)).rejects.toThrow(/20 GB/);
  });
});

describe("signUploadRequest", () => {
  it("signs the full multipart lifecycle for the uploader, binding the upload id", async () => {
    const { key } = await upload(paidOrder, "Session/Lead.wav", 3 * PART_BYTES);
    const create = await signUploadRequest(client, { op: "createMultipart", key });
    expect(create.url).toContain("/create/");
    expect(create.headers).toEqual({ "Content-Type": "application/octet-stream" });

    expect((await signUploadRequest(client, { op: "uploadPart", key, uploadId: "U1", partNumber: 1 })).url).toContain("/part/");
    expect((await signUploadRequest(client, { op: "uploadPart", key, uploadId: "U1", partNumber: 3 })).url).toContain("&3");
    await signUploadRequest(client, { op: "listParts", key, uploadId: "U1" });
    await signUploadRequest(client, { op: "completeMultipart", key, uploadId: "U1" });

    // A different multipart upload on the same row is refused...
    await expect(
      signUploadRequest(client, { op: "uploadPart", key, uploadId: "U2", partNumber: 1 }),
    ).rejects.toBeInstanceOf(InvalidSignRequestError);
    // ...unless the client restarts with a fresh create, which aborts U1 server-side first.
    await signUploadRequest(client, { op: "createMultipart", key });
    expect(r2.abortMultipart).toHaveBeenCalledWith(key, "U1");
    await signUploadRequest(client, { op: "uploadPart", key, uploadId: "U2", partNumber: 1 });
  });

  it("signs a size-locked single PUT only for small files not mid-multipart", async () => {
    const small = await upload(paidOrder, "Session/Tiny.wav", 1000);
    const put = await signUploadRequest(client, { op: "putObject", key: small.key });
    expect(put.url).toContain("/put/");
    expect(put.url).toContain("?1000"); // content length is part of the signature
    expect(put.headers).toEqual({ "Content-Type": "application/octet-stream" });

    const big = await upload(paidOrder, "Session/NotTiny.wav", 5 * 1024 ** 2 + 1);
    await expect(signUploadRequest(client, { op: "putObject", key: big.key })).rejects.toBeInstanceOf(
      InvalidSignRequestError,
    );

    const mid = await upload(paidOrder, "Session/Mid.wav", 1000);
    await signUploadRequest(client, { op: "createMultipart", key: mid.key });
    await signUploadRequest(client, { op: "uploadPart", key: mid.key, uploadId: "M", partNumber: 1 });
    await expect(signUploadRequest(client, { op: "putObject", key: mid.key })).rejects.toBeInstanceOf(
      InvalidSignRequestError,
    );
  });

  it("refuses part numbers beyond the declared size", async () => {
    const { key } = await upload(paidOrder, "Session/Small.wav", PART_BYTES);
    await signUploadRequest(client, { op: "createMultipart", key });
    await expect(
      signUploadRequest(client, { op: "uploadPart", key, uploadId: "U", partNumber: 2 }),
    ).rejects.toBeInstanceOf(InvalidSignRequestError);
  });

  it("refuses anyone but the uploader, and unknown keys", async () => {
    const { key } = await upload(paidOrder, "Session/Private.wav", 10);
    for (const who of [otherClient, engineer, otherEngineer]) {
      await expect(signUploadRequest(who, { op: "createMultipart", key })).rejects.toBeInstanceOf(FileNotFoundError);
    }
    await expect(
      signUploadRequest(client, { op: "createMultipart", key: `orders/${paidOrder}/stems/x/evil.wav` }),
    ).rejects.toBeInstanceOf(FileNotFoundError);
  });

  it("refuses completed files and orders that no longer accept uploads", async () => {
    const order = await newOrder();
    const { key, fileId } = await upload(order, "Session/Late.wav", 10);
    await transitionOrder(order, "declined", { kind: "engineer", userId: engineer });
    await expect(signUploadRequest(client, { op: "createMultipart", key })).rejects.toBeInstanceOf(UploadNotAllowedError);

    const { key: doneKey, fileId: doneId } = await upload(paidOrder, "Session/Finished.wav", 10);
    r2.headObjectSize.mockResolvedValue(10);
    await completeUpload(client, doneId);
    await expect(signUploadRequest(client, { op: "createMultipart", key: doneKey })).rejects.toBeInstanceOf(
      FileNotFoundError,
    );
    expect(fileId).toBeTruthy();
  });
});

describe("completeUpload", () => {
  it("aborts every other multipart upload on the key before checking the size", async () => {
    const { fileId, key } = await upload(paidOrder, "Session/Swap.wav", 50);
    const order: string[] = [];
    r2.abortAllMultipartUploads.mockImplementation(async () => (order.push("abortAll"), 1));
    r2.headObjectSize.mockImplementation(async () => (order.push("head"), 50));
    expect(await completeUpload(client, fileId)).toBe("complete");
    expect(r2.abortAllMultipartUploads).toHaveBeenCalledWith(key);
    expect(order).toEqual(["abortAll", "head"]);
  });

  it("refuses signing while a file is being verified, and the sentinel as an upload id", async () => {
    const { fileId, key } = await upload(paidOrder, "Session/Locked.wav", 50);
    let signDuringVerify: unknown;
    r2.abortAllMultipartUploads.mockImplementation(async () => {
      signDuringVerify = await signUploadRequest(client, { op: "createMultipart", key }).catch((e) => e);
      return 0;
    });
    r2.headObjectSize.mockResolvedValue(50);
    await completeUpload(client, fileId);
    expect(signDuringVerify).toBeInstanceOf(InvalidSignRequestError);

    const other = await upload(paidOrder, "Session/Sentinel.wav", 50);
    await expect(
      signUploadRequest(client, { op: "listParts", key: other.key, uploadId: "__verifying__" }),
    ).rejects.toBeInstanceOf(InvalidSignRequestError);
  });

  it("is refused once the order no longer accepts uploads", async () => {
    const order = await newOrder();
    const { fileId } = await upload(order, "Session/TooLate.wav", 10);
    await transitionOrder(order, "declined", { kind: "engineer", userId: engineer });
    r2.headObjectSize.mockResolvedValue(10);
    await expect(completeUpload(client, fileId)).rejects.toBeInstanceOf(UploadNotAllowedError);
  });

  it("marks complete only when the stored size matches", async () => {
    const { fileId } = await upload(paidOrder, "Session/Exact.wav", 1234);
    r2.headObjectSize.mockResolvedValue(1234);
    expect(await completeUpload(client, fileId)).toBe("complete");
    expect(await completeUpload(client, fileId)).toBe("complete"); // idempotent
  });

  it("fails and deletes the object on a size mismatch", async () => {
    const { fileId, key } = await upload(paidOrder, "Session/Liar.wav", 100);
    r2.headObjectSize.mockResolvedValue(999_999);
    expect(await completeUpload(client, fileId)).toBe("failed");
    expect(r2.deleteObject).toHaveBeenCalledWith(key);
  });

  it("fails when nothing was uploaded", async () => {
    const { fileId } = await upload(paidOrder, "Session/Missing.wav", 100);
    r2.headObjectSize.mockResolvedValue(null);
    expect(await completeUpload(client, fileId)).toBe("failed");
    expect(r2.deleteObject).not.toHaveBeenCalled();
  });

  it("is only callable by the uploader", async () => {
    const { fileId } = await upload(paidOrder, "Session/Mine.wav", 100);
    await expect(completeUpload(engineer, fileId)).rejects.toBeInstanceOf(FileNotFoundError);
    expect(r2.headObjectSize).not.toHaveBeenCalled();
  });
});

describe("listing and downloads", () => {
  let order: string;
  let done: string;
  let pending: string;

  beforeAll(async () => {
    order = await newOrder();
    done = (await upload(order, "Session/Audio Files/Done.wav", 10)).fileId;
    pending = (await upload(order, "Session/Audio Files/Pending.wav", 10)).fileId;
    r2.headObjectSize.mockResolvedValue(10);
    await completeUpload(client, done);
  });

  it("engineer sees completed files; client also sees their pending ones; others see nothing", async () => {
    expect((await listOrderFiles(engineer, order)).map((f) => f.id)).toEqual([done]);
    expect((await listOrderFiles(client, order)).map((f) => f.id).sort()).toEqual([done, pending].sort());
    expect(await listOrderFiles(otherEngineer, order)).toEqual([]);
    expect(await listOrderFiles(otherClient, order)).toEqual([]);
    const [f] = await listOrderFiles(engineer, order);
    expect(Object.keys(f)).not.toContain("r2Key");
    expect(Object.keys(f)).not.toContain("uploadId");
  });

  it("signs downloads for participants, completed files on that order only", async () => {
    const urls = await getDownloadUrls(engineer, order, [done, pending, randomUUID()]);
    expect(urls.map((u) => u.id)).toEqual([done]);
    expect(urls[0]).toMatchObject({ relativePath: "Session/Audio Files/Done.wav", sizeBytes: 10 });
    expect(urls[0].url).toContain("/download/");

    // A file id from another order can't be pulled in via this order.
    const other = await newOrder();
    const foreign = (await upload(other, "x.wav", 10)).fileId;
    await completeUpload(client, foreign);
    expect(await getDownloadUrls(engineer, order, [foreign])).toEqual([]);
  });

  it("refuses non-participants and engineers on drafts", async () => {
    await expect(getDownloadUrls(otherEngineer, order, [done])).rejects.toBeInstanceOf(FileNotFoundError);
    await expect(getDownloadUrls(otherClient, order, [done])).rejects.toBeInstanceOf(FileNotFoundError);
    const draft = await newOrder(false);
    await expect(getDownloadUrls(engineer, draft, [done])).rejects.toBeInstanceOf(FileNotFoundError);
  });

  it("caps batch size", async () => {
    const ids = Array.from({ length: 101 }, () => randomUUID());
    await expect(getDownloadUrls(client, order, ids)).rejects.toBeInstanceOf(InvalidSignRequestError);
  });
});
