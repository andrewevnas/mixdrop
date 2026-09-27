"use client";

import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/bytes";

export type DownloadableFile = { id: string; relativePath: string; sizeBytes: number };
type SignedFile = DownloadableFile & { url: string };

// File System Access API (Chromium). Not in TypeScript's DOM lib yet.
type DirectoryPicker = (opts?: { mode?: "readwrite"; id?: string }) => Promise<FileSystemDirectoryHandle>;
const picker = () =>
  (globalThis as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;

const noopSubscribe = () => () => {};

export const downloadFolderName = (orderId: string) => `Mixdrop-${orderId.slice(0, 8)}`;

// URLs expire after 15 minutes, so sign small batches just before they're needed.
const BATCH = 20;

async function signBatch(orderId: string, ids: string[]): Promise<SignedFile[]> {
  const res = await fetch(`/api/orders/${orderId}/downloads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileIds: ids }),
  });
  if (!res.ok) throw new Error(`Couldn't get download links (${res.status})`);
  return ((await res.json()) as { files: SignedFile[] }).files;
}

/** Split a server-sanitised relative path, refusing anything that could escape the chosen folder. */
function segmentsOf(relativePath: string): string[] {
  const parts = relativePath.split("/");
  if (parts.some((p) => p === "" || p === "." || p === ".." || p.includes("\\"))) {
    throw new Error(`Unsafe path: ${relativePath}`);
  }
  return parts;
}

async function writeInto(root: FileSystemDirectoryHandle, file: SignedFile, onBytes: (n: number) => void) {
  const parts = segmentsOf(file.relativePath);
  let dir = root;
  for (const folder of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(folder, { create: true });
  const handle = await dir.getFileHandle(parts.at(-1)!, { create: true });

  // Resume: a file already on disk at the right size is skipped.
  if ((await handle.getFile()).size === file.sizeBytes) {
    onBytes(file.sizeBytes);
    return;
  }
  const res = await fetch(file.url);
  if (!res.ok || !res.body) throw new Error(`Download failed for ${file.relativePath} (${res.status})`);
  const writable = await handle.createWritable();
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      onBytes(chunk.byteLength);
      controller.enqueue(chunk);
    },
  });
  await res.body.pipeThrough(counter).pipeTo(writable); // closes the writable on success
}

export function FolderDownload({ orderId, files }: { orderId: string; files: DownloadableFile[] }) {
  const [state, setState] = useState<{ done: number; bytes: number; error?: string; finished?: boolean } | null>(
    null,
  );
  const total = files.reduce((n, f) => n + f.sizeBytes, 0);
  // false on the server, real value after hydration (no mismatch).
  const supported = useSyncExternalStore(noopSubscribe, () => !!picker(), () => false);

  if (files.length === 0) return null;

  async function downloadAll() {
    const pick = picker();
    if (!pick) return;
    let picked: FileSystemDirectoryHandle;
    try {
      picked = await pick({ mode: "readwrite", id: `mixdrop-${orderId}` });
    } catch {
      return; // user cancelled
    }
    let bytes = 0;
    setState({ done: 0, bytes: 0 });
    try {
      // Always write into our own subfolder, so client-chosen paths can never overwrite files
      // the engineer already had in the folder they picked. Reused on re-run (resume).
      const root = await picked.getDirectoryHandle(downloadFolderName(orderId), { create: true });
      for (let i = 0; i < files.length; i += BATCH) {
        const signed = await signBatch(orderId, files.slice(i, i + BATCH).map((f) => f.id));
        for (const f of signed) {
          await writeInto(root, f, (n) => {
            bytes += n;
            setState((s) => (s ? { ...s, bytes } : s));
          });
          setState((s) => (s ? { ...s, done: s.done + 1 } : s));
        }
      }
      setState((s) => (s ? { ...s, finished: true } : s));
    } catch (e) {
      setState((s) => ({ done: s?.done ?? 0, bytes, error: (e as Error).message }));
    }
  }

  async function downloadOne(id: string) {
    const [f] = await signBatch(orderId, [id]);
    if (f) window.location.assign(f.url); // attachment disposition: saves, doesn't navigate
  }

  return (
    <div className="grid gap-3">
      {supported ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={downloadAll} disabled={!!state && !state.finished && !state.error}>
            Download all to a folder…
          </Button>
          <span className="text-muted-foreground text-sm">
            {files.length} files · {formatBytes(total)} · saved into a new “{downloadFolderName(orderId)}” folder
            with the structure intact
          </span>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          To download everything with its folders intact, use Chrome or Edge. Or download files one by one below.
        </p>
      )}
      {state && (
        <p role="status" data-testid="download-status" className="text-sm">
          {state.error
            ? `Stopped: ${state.error}. Run it again to resume — finished files are skipped.`
            : state.finished
              ? `Done: ${state.done} files saved.`
              : `Downloading ${state.done}/${files.length} files · ${formatBytes(state.bytes)} of ${formatBytes(total)}`}
        </p>
      )}
      {!supported && (
        <ul className="grid gap-1 text-sm">
          {files.map((f) => (
            <li key={f.id}>
              <button type="button" className="underline" onClick={() => downloadOne(f.id)}>
                {f.relativePath}
              </button>{" "}
              <span className="text-muted-foreground">{formatBytes(f.sizeBytes)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
