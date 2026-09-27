"use client";

import dynamic from "next/dynamic";

// Uppy touches browser APIs on construction, so it must never render on the server.
export const LazyUploader = dynamic(() => import("./uploader").then((m) => m.Uploader), {
  ssr: false,
  loading: () => <p className="text-muted-foreground text-sm">Loading uploader…</p>,
});
