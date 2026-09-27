import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, type Page, test } from "@playwright/test";

import { createPaidOrder, r2Configured, readOpfsTree, stubDirectoryPickerWithOpfs } from "./helpers";

test.skip(!r2Configured(), "R2_* env vars not set in .env.local");

const MB = 1024 * 1024;

// A small Pro Tools-style session. "Vox Lead.wav" spans 3 upload parts (16 MB each).
const SESSION: Record<string, Buffer> = {
  "Night Drive.ptx": randomBytes(4096),
  "Audio Files/Kick_01.wav": randomBytes(200 * 1024),
  "Audio Files/Snare_01.wav": randomBytes(150 * 1024),
  "Audio Files/Vox Lead.wav": Buffer.alloc(40 * MB, 7),
  "Session File Backups/Night Drive.bak.001.ptx": randomBytes(2048),
};

let root: string;
let sessionDir: string;

test.beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "mixdrop-e2e-"));
  sessionDir = join(root, "Night Drive");
  for (const [rel, bytes] of Object.entries(SESSION)) {
    const full = join(sessionDir, ...rel.split("/"));
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, bytes);
  }
});
test.afterAll(() => rmSync(root, { recursive: true, force: true }));

/** Choose a whole folder in the Uppy Dashboard (its hidden webkitdirectory input). */
async function addFolder(page: Page, dir: string) {
  // With files already listed (e.g. a restored session), the picker is behind "Add more".
  const addMore = page.getByRole("button", { name: "Add more files" });
  if (await addMore.isVisible().catch(() => false)) await addMore.click();
  await page.locator("input.uppy-Dashboard-input[webkitdirectory]").setInputFiles(dir);
}

const partPut = (url: string) => url.includes("r2.cloudflarestorage.com") && url.includes("partNumber=");

test("folder upload survives a refresh and downloads with its structure intact", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const client = await (await browser.newContext()).newPage();
  const engineerCtx = await browser.newContext();
  const engineer = await engineerCtx.newPage();
  await stubDirectoryPickerWithOpfs(engineer);

  const orderId = await createPaidOrder(client, engineer);

  // Start the upload, then refresh as soon as the first part of the big file lands in R2.
  const partsBeforeReload = new Set<string>();
  client.on("requestfinished", (req) => {
    if (req.method() === "PUT" && partPut(req.url()) && req.url().includes("Vox_Lead.wav")) {
      partsBeforeReload.add(new URL(req.url()).searchParams.get("partNumber")!);
    }
  });
  await addFolder(client, sessionDir);
  await client.getByRole("button", { name: /^Upload \d+ files?$/ }).click();
  await expect.poll(() => partsBeforeReload.size, { timeout: 120_000 }).toBeGreaterThan(0);
  const alreadySent = new Set(partsBeforeReload);
  client.removeAllListeners("requestfinished");

  await client.reload();
  // Golden Retriever restores the in-flight upload asynchronously; wait for it like a user would.
  await expect(client.getByText("Session restored")).toBeVisible({ timeout: 30_000 });

  // After the refresh, re-add the same folder: finished files are skipped and the big file resumes.
  const partsAfterReload: string[] = [];
  client.on("requestfinished", (req) => {
    if (req.method() === "PUT" && partPut(req.url()) && req.url().includes("Vox_Lead.wav")) {
      partsAfterReload.push(new URL(req.url()).searchParams.get("partNumber")!);
    }
  });
  await addFolder(client, sessionDir);
  const upload = client.getByRole("button", { name: /^(Upload|Resume|Retry)/ });
  if (await upload.isVisible().catch(() => false)) await upload.click();

  // Let Uppy finish (never reload mid-upload), then let the /complete calls land.
  await expect(client.locator(".uppy-StatusBar.is-complete")).toBeVisible({ timeout: 180_000 });
  await client.waitForLoadState("networkidle");
  await client.reload();
  // All 5 files listed as complete on the client's page.
  await expect(client.getByTestId("file-list").locator("li", { hasNotText: /uploading|failed/ })).toHaveCount(
    Object.keys(SESSION).length,
  );
  // Parts that reached R2 before the refresh weren't sent again.
  for (const p of alreadySent) expect(partsAfterReload).not.toContain(p);

  // Engineer downloads everything into a folder.
  await engineer.goto(`/engineer/orders/${orderId}`);
  await engineer.getByRole("button", { name: "Download all to a folder…" }).click();
  await expect(engineer.getByTestId("download-status")).toHaveText(/Done: 5 files saved/, { timeout: 120_000 });

  // Everything lands in a fresh Mixdrop-<order> subfolder, structure intact.
  const folder = `Mixdrop-${orderId.slice(0, 8)}`;
  const tree = await readOpfsTree(engineer);
  expect(tree).toEqual(
    Object.fromEntries(Object.entries(SESSION).map(([rel, bytes]) => [`${folder}/Night Drive/${rel}`, bytes.length])),
  );

  // Byte-for-byte check on one file.
  const kickHash = await engineer.evaluate(async (folder) => {
    const root = await navigator.storage.getDirectory();
    let dir = await root.getDirectoryHandle("download");
    for (const d of [folder, "Night Drive", "Audio Files"]) dir = await dir.getDirectoryHandle(d);
    const file = await (await dir.getFileHandle("Kick_01.wav")).getFile();
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }, folder);
  expect(kickHash).toBe(createHash("sha256").update(SESSION["Audio Files/Kick_01.wav"]).digest("hex"));

  // Running it again resumes: everything's already there, nothing re-downloaded.
  let r2Gets = 0;
  engineer.on("request", (req) => {
    if (req.method() === "GET" && req.url().includes("r2.cloudflarestorage.com")) r2Gets++;
  });
  await engineer.getByRole("button", { name: "Download all to a folder…" }).click();
  await expect(engineer.getByTestId("download-status")).toHaveText(/Done: 5 files saved/);
  expect(r2Gets).toBe(0);
});

test("engineers can't upload, and uploads are closed before payment", async ({ browser }) => {
  const client = await (await browser.newContext()).newPage();
  const engineer = await (await browser.newContext()).newPage();
  const orderId = await createPaidOrder(client, engineer);

  // The engineer's own API call is refused.
  await engineer.goto(`/engineer/orders/${orderId}`);
  const res = await engineer.request.post(`/api/orders/${orderId}/uploads`, {
    data: { kind: "stems", relativePath: "x.wav", sizeBytes: 1, mime: "audio/wav" },
  });
  expect(res.status()).toBe(403);
  await expect(engineer.locator(".uppy-Dashboard")).toHaveCount(0);

  // A JSON content type is required (blocks cross-site form posts).
  const form = await client.request.post(`/api/orders/${orderId}/uploads`, {
    form: { kind: "stems", relativePath: "x.wav", sizeBytes: "1", mime: "audio/wav" },
  });
  expect(form.status()).toBe(415);
});
