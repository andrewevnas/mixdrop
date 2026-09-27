// The Phase 4 done check, at full size: a ~5 GB Pro Tools session uploads to R2, survives a
// refresh, and every file is in R2 at its full size with the folder structure intact.
// Opt-in and slow (depends on your upload bandwidth): `pnpm e2e:big`.
//
// The session is built from NTFS sparse files — each reports 128 MB but uses ~no disk — so it
// runs on a nearly-full drive. Windows only (uses fsutil).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { createPaidOrder, r2Configured } from "./helpers";

const FILE_BYTES = 128 * 1024 * 1024;
const AUDIO_FILES = 40; // 40 × 128 MiB = 5 GiB
const TOTAL_BYTES = AUDIO_FILES * FILE_BYTES + 4096;

test.skip(!r2Configured(), "R2_* env vars not set in .env.local");
test.skip(process.platform !== "win32", "sparse fixture uses fsutil (Windows)");

function sparseFile(path: string, size: number) {
  writeFileSync(path, "");
  execFileSync("fsutil", ["sparse", "setflag", path]);
  execFileSync("fsutil", ["file", "seteof", path, String(size)]);
}

let root: string;
let session: string;
const expected: Record<string, number> = {};

test.beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "mixdrop-big-"));
  session = join(root, "Big Session");
  mkdirSync(join(session, "Audio Files"), { recursive: true });
  writeFileSync(join(session, "Big Session.ptx"), Buffer.alloc(4096, 1));
  expected["Big Session/Big Session.ptx"] = 4096;
  for (let i = 1; i <= AUDIO_FILES; i++) {
    const name = `Track ${String(i).padStart(2, "0")}_01.wav`;
    sparseFile(join(session, "Audio Files", name), FILE_BYTES);
    expected[`Big Session/Audio Files/${name}`] = FILE_BYTES;
  }
});
test.afterAll(() => rmSync(root, { recursive: true, force: true }));

test("@big 5 GB Pro Tools folder: upload, refresh, resume, verify in R2", async ({ browser }) => {
  test.setTimeout(3 * 60 * 60_000);
  const client = await (await browser.newContext()).newPage();
  const engineer = await (await browser.newContext()).newPage();
  const orderId = await createPaidOrder(client, engineer, "Big Session");

  const folderInput = client.locator("input.uppy-Dashboard-input[webkitdirectory]");
  let sentBytes = 0;
  client.on("requestfinished", (req) => {
    if (req.method() === "PUT" && req.url().includes("partNumber=")) sentBytes += req.postDataBuffer()?.length ?? 16 * 1024 * 1024;
  });

  await folderInput.setInputFiles(session);
  await client.getByRole("button", { name: /^Upload \d+ files$/ }).click();

  // Refresh once ~10% is in R2.
  await expect.poll(() => sentBytes, { timeout: 60 * 60_000, intervals: [5_000] }).toBeGreaterThan(TOTAL_BYTES / 10);
  await client.reload();
  await expect(client.getByText("Session restored")).toBeVisible({ timeout: 30_000 });
  const addMore = client.getByRole("button", { name: "Add more files" });
  if (await addMore.isVisible().catch(() => false)) await addMore.click();
  await folderInput.setInputFiles(session);
  const resume = client.getByRole("button", { name: /^(Upload|Resume|Retry)/ });
  if (await resume.isVisible().catch(() => false)) await resume.click();

  // Wait for Uppy to finish (never reload mid-upload), then let the /complete calls land.
  await expect(client.locator(".uppy-StatusBar.is-complete")).toBeVisible({ timeout: 3 * 60 * 60_000 });
  await client.waitForLoadState("networkidle");
  await client.reload();
  await expect(client.getByTestId("file-list").locator("li", { hasNotText: /uploading|failed/ })).toHaveCount(
    AUDIO_FILES + 1,
  );

  // Engineer's view: every file, at its path, full size in R2 (ranged GET of 1 byte reads the
  // real object length without downloading 5 GB onto a full disk).
  await engineer.goto(`/engineer/orders/${orderId}`);
  await expect(engineer.getByText(/41 files · 5\.0 GB/).first()).toBeVisible();
  const ids = await engineer
    .locator("[data-file-id]")
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.fileId!));
  expect(ids.length).toBeGreaterThanOrEqual(AUDIO_FILES + 1);

  const found: Record<string, number> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const res = await engineer.request.post(`/api/orders/${orderId}/downloads`, { data: { fileIds: ids.slice(i, i + 50) } });
    expect(res.ok()).toBe(true);
    for (const f of (await res.json()).files as { relativePath: string; url: string }[]) {
      const probe = await fetch(f.url, { headers: { Range: "bytes=0-0" } });
      expect(probe.status).toBe(206);
      expect(probe.headers.get("content-disposition")).toMatch(/^attachment;/);
      found[f.relativePath] = Number(probe.headers.get("content-range")!.split("/")[1]);
      await probe.body?.cancel();
    }
  }
  expect(found).toEqual(expected);
});
