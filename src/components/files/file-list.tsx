import { formatBytes } from "@/lib/bytes";
import type { OrderFile } from "@/server/data/files";

const KIND_LABELS: Record<OrderFile["kind"], string> = {
  stems: "Stems / session",
  project: "Project file",
  reference: "Reference",
  demo: "Demo",
  delivery: "Delivery",
};

/** Files grouped by kind, then listed with their folder path. */
export function FileList({ files }: { files: OrderFile[] }) {
  if (files.length === 0) return <p className="text-muted-foreground text-sm">No files yet.</p>;
  const kinds = [...new Set(files.map((f) => f.kind))];
  return (
    <div className="grid gap-4">
      {kinds.map((kind) => {
        const group = files.filter((f) => f.kind === kind);
        const bytes = group.reduce((n, f) => n + f.sizeBytes, 0);
        return (
          <section key={kind} className="grid gap-1">
            <h3 className="text-sm font-medium">
              {KIND_LABELS[kind]} <span className="text-muted-foreground font-normal">· {group.length} files · {formatBytes(bytes)}</span>
            </h3>
            <ul data-testid="file-list" className="max-h-72 overflow-auto rounded-md border text-sm">
              {group.map((f) => (
                <li key={f.id} data-file-id={f.id} className="flex justify-between gap-4 border-b px-3 py-1.5 last:border-b-0">
                  <span className="font-mono text-xs break-all">{f.relativePath}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {f.status === "complete" ? formatBytes(f.sizeBytes) : f.status === "pending" ? "uploading…" : "failed"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
