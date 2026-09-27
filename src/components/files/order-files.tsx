import type { Order } from "@/db/schema";
import { listOrderFiles, UPLOADABLE_STATUSES } from "@/server/data/files";
import { isR2Configured } from "@/server/storage/r2";

import { FileList } from "./file-list";
import { FolderDownload } from "./folder-download";
import { LazyUploader } from "./uploader-lazy";

/** "Files" section of an order page. The caller must already have checked the viewer is a participant. */
export async function OrderFiles({ order, viewerId, role }: { order: Order; viewerId: string; role: "client" | "engineer" }) {
  const files = await listOrderFiles(viewerId, order.id);
  const complete = files
    .filter((f) => f.status === "complete")
    .map((f) => ({ id: f.id, relativePath: f.relativePath, sizeBytes: f.sizeBytes }));
  const canUpload = role === "client" && UPLOADABLE_STATUSES.includes(order.status);

  return (
    <section className="grid gap-4">
      <h2 className="font-medium">Files</h2>
      {!isR2Configured() ? (
        <p className="text-muted-foreground text-sm">File storage isn&apos;t configured (R2_* env vars).</p>
      ) : (
        <>
          {canUpload && <LazyUploader orderId={order.id} />}
          {role === "client" && order.status === "draft" && (
            <p className="text-muted-foreground text-sm">You can upload files once the order is paid.</p>
          )}
          <FolderDownload orderId={order.id} files={complete} />
        </>
      )}
      <FileList files={files} />
    </section>
  );
}
