"use client";

import "@uppy/core/css/style.min.css";
import "@uppy/dashboard/css/style.min.css";

import AwsS3 from "@uppy/aws-s3";
import Uppy, { type Meta, type UppyFile } from "@uppy/core";
import GoldenRetriever from "@uppy/golden-retriever";
import Dashboard from "@uppy/react/dashboard";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Label } from "@/components/ui/label";
import { CLIENT_UPLOAD_KINDS, MAX_FILE_BYTES, PART_BYTES } from "@/server/storage/paths";

type FileMeta = Meta & { kind?: string; relativePath?: string | null; key?: string; fileId?: string };
type Registered = { fileId: string; key: string; status: "pending" | "complete" };

const KIND_LABELS: Record<(typeof CLIENT_UPLOAD_KINDS)[number], string> = {
  stems: "Stems / session",
  project: "Project file",
  reference: "Reference track",
  demo: "Demo / rough mix",
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Folder paths from drag-and-drop start with "/"; the server wants them relative. */
const relativePathOf = (file: UppyFile<FileMeta, Record<string, never>>) =>
  (file.meta.relativePath || file.name || "file").replace(/^\/+/, "");

function createUppy(orderId: string, onSkipped: (n: number) => void) {
  const uppy = new Uppy<FileMeta, Record<string, never>>({
    id: `order-${orderId}`, // Golden Retriever keys its saved state by this id.
    autoProceed: false,
    restrictions: { maxFileSize: MAX_FILE_BYTES },
    meta: { kind: "stems" },
  });

  // Register each file with the server as soon as it's added (gets our object key; skips files
  // already uploaded). The upload waits for these via the pre-processor below.
  const registrations = new Map<string, Promise<Registered | null>>();
  uppy.on("files-added", (added) => {
    let skipped = 0;
    for (const file of added) {
      const p = postJson<Registered>(`/api/orders/${orderId}/uploads`, {
        kind: file.meta.kind ?? "stems",
        relativePath: relativePathOf(file),
        sizeBytes: file.size ?? 0,
        mime: file.type || "application/octet-stream",
      })
        .then((reg) => {
          if (reg.status === "complete") {
            skipped++;
            uppy.removeFile(file.id);
            return null;
          }
          uppy.setFileMeta(file.id, { key: reg.key, fileId: reg.fileId });
          return reg;
        })
        .catch((e: Error) => {
          uppy.info(`${relativePathOf(file)}: ${e.message}`, "error", 8000);
          uppy.removeFile(file.id);
          return null;
        });
      registrations.set(file.id, p);
    }
    void Promise.all([...registrations.values()]).then(() => skipped && onSkipped(skipped));
  });
  uppy.addPreProcessor(async (fileIDs) => {
    await Promise.all(fileIDs.map((id) => registrations.get(id)));
  });

  uppy.use(AwsS3, {
    shouldUseMultipart: true,
    getChunkSize: () => PART_BYTES,
    limit: 4,
    // The server chose the key at registration; never let the client invent one.
    generateObjectKey: (file) => {
      const key = file.meta.key;
      if (typeof key !== "string" || !key) throw new Error("File was not registered");
      return key;
    },
    signRequest: (req) =>
      postJson<{ url: string; headers?: Record<string, string> }>("/api/uploads/sign", {
        method: req.method,
        key: req.key,
        uploadId: "uploadId" in req ? req.uploadId : undefined,
        partNumber: "partNumber" in req ? req.partNumber : undefined,
      }),
  });
  // Remembers in-progress multipart uploads across a refresh; re-adding the same files resumes them.
  uppy.use(GoldenRetriever, { serviceWorker: false });

  return uppy;
}

export function Uploader({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [uppy] = useState(() =>
    createUppy(orderId, (n) => setNotice(`${n} file${n === 1 ? " was" : "s were"} already uploaded and skipped.`)),
  );
  const [kind, setKind] = useState<string>("stems");

  useEffect(() => {
    const onSuccess = async (file: UppyFile<FileMeta, Record<string, never>> | undefined) => {
      if (!file?.meta.fileId) return;
      try {
        await postJson(`/api/uploads/${file.meta.fileId}/complete`, {});
      } catch {
        uppy.info(`${relativePathOf(file)} didn't upload correctly. Please add it again.`, "error", 10000);
      }
    };
    const onComplete = () => router.refresh();
    uppy.on("upload-success", onSuccess);
    uppy.on("complete", onComplete);
    return () => {
      uppy.off("upload-success", onSuccess);
      uppy.off("complete", onComplete);
    };
  }, [uppy, router]);

  // Destroy on real unmount only. React Strict Mode (dev) unmounts and immediately re-mounts;
  // destroying synchronously there would leave the Dashboard attached to a dead Uppy.
  const destroyTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(destroyTimer.current);
    return () => {
      destroyTimer.current = window.setTimeout(() => uppy.destroy(), 0);
    };
  }, [uppy]);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="upload-kind">Adding</Label>
        <select
          id="upload-kind"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            uppy.setMeta({ kind: e.target.value });
          }}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          {CLIENT_UPLOAD_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      <Dashboard
        uppy={uppy}
        width="100%"
        height={380}
        fileManagerSelectionType="both"
        proudlyDisplayPoweredByUppy={false}
        note="Drop your Pro Tools session folder or stems. Refreshed mid-upload? Add the same folder again to resume."
      />
    </div>
  );
}
