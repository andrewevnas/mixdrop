// Pure helpers for upload paths, object keys and quotas. No I/O.

export const FILE_KINDS = ["stems", "project", "reference", "demo", "delivery"] as const;
export type FileKind = (typeof FILE_KINDS)[number];
/** Kinds a client may upload. Deliveries are the engineer's (Phase 5). */
export const CLIENT_UPLOAD_KINDS = ["stems", "project", "reference", "demo"] as const satisfies readonly FileKind[];

export const MAX_FILE_BYTES = 10 * 1024 ** 3; // 10 GiB
export const MAX_ORDER_BYTES = 20 * 1024 ** 3; // 20 GiB
export const MAX_ORDER_FILES = 5000;
export const MAX_RELATIVE_PATH = 512;
export const MAX_PATH_DEPTH = 32;
/** Parts are uploaded in equal-size chunks (R2 requires all but the last to match). */
export const PART_BYTES = 16 * 1024 ** 2;
export const MAX_PARTS = 10_000;
/** Uppy sends files up to 5 MiB as one PUT instead of multipart (its MIN_CHUNK_SIZE). */
export const SINGLE_PUT_MAX_BYTES = 5 * 1024 ** 2;

// Windows-reserved device names; a folder called "CON" can't be created on the engineer's disk.
const WINDOWS_RESERVED = /^(con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;
// Folders that tools act on automatically if they appear in the engineer's download folder.
const DANGEROUS_SEGMENTS = new Set([".git", ".hg", ".svn", ".vscode", ".idea"]);
const MAX_SEGMENT = 255;
// C0/C1 control chars and characters invalid in Windows file names.
const BAD_CHARS = /[\u0000-\u001f\u007f-\u009f<>:"|?*]/;

export class InvalidPathError extends Error {}

/**
 * Normalise a browser-supplied relative path (e.g. `Session/Audio Files/Kick_01.wav` from a
 * folder upload) into a safe, portable form, or throw InvalidPathError. The result is only ever
 * used as metadata and to recreate folders on download — never as a server filesystem path.
 */
export function sanitizeRelativePath(input: string): string {
  const normalized = input.normalize("NFC").replaceAll("\\", "/");
  if (normalized.length === 0 || normalized.length > MAX_RELATIVE_PATH) {
    throw new InvalidPathError("Path is empty or too long");
  }
  if (normalized.startsWith("/") || /^[a-z]:/i.test(normalized)) {
    throw new InvalidPathError("Path must be relative");
  }
  const segments = normalized.split("/");
  if (segments.length > MAX_PATH_DEPTH) throw new InvalidPathError("Path is nested too deeply");
  for (const s of segments) {
    if (s === "" || s === "." || s === "..") throw new InvalidPathError("Invalid path segment");
    if (s.length > MAX_SEGMENT) throw new InvalidPathError("File or folder name is too long");
    if (DANGEROUS_SEGMENTS.has(s.toLowerCase())) throw new InvalidPathError("That folder name isn't allowed");
    if (BAD_CHARS.test(s)) throw new InvalidPathError("Path contains invalid characters");
    if (s !== s.trim() || s.endsWith(".")) throw new InvalidPathError("Invalid path segment");
    if (WINDOWS_RESERVED.test(s)) throw new InvalidPathError("Reserved file name");
  }
  return segments.join("/");
}

/** Last segment of a sanitised relative path. */
export const baseName = (relativePath: string) => relativePath.slice(relativePath.lastIndexOf("/") + 1);

/**
 * Object-key-safe version of a file name: ASCII letters, digits, dot, dash, underscore.
 * The original name is kept in the DB; the key only needs to be unique and harmless.
 */
export function keySafeName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // drop combining accents: "é" → "e"
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "")
    .slice(-100);
  return cleaned || "file";
}

export function buildObjectKey(orderId: string, kind: FileKind, fileId: string, name: string): string {
  return `orders/${orderId}/${kind}/${fileId}/${keySafeName(name)}`;
}

/** Why an upload of `size` bytes can't be added to an order, or null if it fits. */
export function quotaError(
  current: { files: number; bytes: number },
  size: number,
): string | null {
  if (!Number.isSafeInteger(size) || size < 0) return "Invalid file size.";
  if (size > MAX_FILE_BYTES) return "Files can be at most 10 GB.";
  if (current.files + 1 > MAX_ORDER_FILES) return `An order can have at most ${MAX_ORDER_FILES} files.`;
  if (current.bytes + size > MAX_ORDER_BYTES) return "This order's 20 GB upload limit would be exceeded.";
  return null;
}

/** Number of parts for a file of `size` bytes (at least 1, even for empty files). */
export const partCount = (size: number) => Math.max(1, Math.ceil(size / PART_BYTES));
