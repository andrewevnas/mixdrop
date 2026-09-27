import { describe, expect, it } from "vitest";

import { formatBytes } from "@/lib/bytes";

import {
  buildObjectKey,
  InvalidPathError,
  keySafeName,
  MAX_FILE_BYTES,
  MAX_ORDER_BYTES,
  MAX_ORDER_FILES,
  PART_BYTES,
  partCount,
  quotaError,
  sanitizeRelativePath,
} from "./paths";

describe("sanitizeRelativePath", () => {
  it.each([
    ["Session/Audio Files/Kick_01.wav", "Session/Audio Files/Kick_01.wav"],
    ["Session\\Audio Files\\Snare.wav", "Session/Audio Files/Snare.wav"],
    ["Night Drive (v2).ptx", "Night Drive (v2).ptx"],
    ["Séance/Voix – lead.wav", "Séance/Voix – lead.wav"],
    ["Session/Session File Backups/Night Drive.bak.001.ptx", "Session/Session File Backups/Night Drive.bak.001.ptx"],
    ["a/.hidden", "a/.hidden"],
  ])("accepts %j", (input, expected) => {
    expect(sanitizeRelativePath(input)).toBe(expected);
  });

  it("normalises unicode to NFC", () => {
    expect(sanitizeRelativePath("Se\u0301ance.wav")).toBe("S\u00e9ance.wav");
  });

  it.each([
    ["", "empty"],
    ["../etc/passwd", "parent traversal"],
    ["Session/../../x.wav", "nested traversal"],
    ["Session/./x.wav", "dot segment"],
    ["/abs/path.wav", "absolute"],
    ["\\\\server\\share\\x.wav", "UNC path"],
    ["C:/Users/x.wav", "drive letter"],
    ["c:x.wav", "drive-relative"],
    ["Session//x.wav", "empty segment"],
    ["Session/x.wav/", "trailing slash"],
    ["Session/x\u0000.wav", "NUL"],
    ["Session/x\n.wav", "newline"],
    ["Session/a<b>.wav", "angle brackets"],
    ["Session/what?.wav", "question mark"],
    ["Session/CON/x.wav", "reserved device name"],
    ["Session/nul.txt", "reserved name with extension"],
    ["Session/trailing. /x.wav", "trailing dot/space"],
    [" leading/x.wav", "leading space"],
    ["x".repeat(513), "too long"],
    [Array.from({ length: 33 }, () => "d").join("/"), "too deep"],
    [`Session/${"x".repeat(256)}.wav`, "segment over 255 chars"],
    ["Session/.git/hooks/pre-commit", ".git folder"],
    ["Session/.VSCode/tasks.json", ".vscode folder (any case)"],
    ["Session/COM¹.wav", "superscript device name"],
    ["Session/CONIN$", "CONIN$"],
  ])("rejects %j (%s)", (input) => {
    expect(() => sanitizeRelativePath(input)).toThrow(InvalidPathError);
  });
});

describe("object keys", () => {
  it("builds orders/{orderId}/{kind}/{fileId}/{safeName}", () => {
    expect(buildObjectKey("o1", "stems", "f1", "Kick 01 (final).wav")).toBe("orders/o1/stems/f1/Kick_01_final_.wav");
  });

  it.each([
    ["../../evil.sh", "evil.sh"],
    ["Séance.wav", "Seance.wav"],
    ["日本語.wav", "wav"],
    ["....", "file"],
    ["", "file"],
  ])("keySafeName(%j) → %j", (input, expected) => {
    expect(keySafeName(input)).toBe(expected);
  });

  it("keeps key names bounded", () => {
    expect(keySafeName(`${"a".repeat(300)}.wav`).length).toBeLessThanOrEqual(100);
  });
});

describe("quotaError", () => {
  const empty = { files: 0, bytes: 0 };
  it("accepts a file within limits", () => {
    expect(quotaError(empty, 5 * 1024 ** 3)).toBeNull();
    expect(quotaError(empty, MAX_FILE_BYTES)).toBeNull();
    expect(quotaError(empty, 0)).toBeNull();
  });

  it.each([
    ["a file over 10 GB", empty, MAX_FILE_BYTES + 1],
    ["exceeding 20 GB per order", { files: 3, bytes: MAX_ORDER_BYTES - 10 }, 11],
    ["the 5,001st file", { files: MAX_ORDER_FILES, bytes: 0 }, 1],
    ["a negative size", empty, -1],
    ["a fractional size", empty, 1.5],
    ["NaN", empty, Number.NaN],
  ])("rejects %s", (_label, current, size) => {
    expect(quotaError(current, size)).not.toBeNull();
  });
});

describe("partCount", () => {
  it.each([
    [0, 1],
    [1, 1],
    [PART_BYTES, 1],
    [PART_BYTES + 1, 2],
    [5 * 1024 ** 3, 320],
    [MAX_FILE_BYTES, 640],
  ])("%i bytes → %i parts", (size, parts) => {
    expect(partCount(size)).toBe(parts);
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [1023, "1023 B"],
    [1536, "1.5 KB"],
    [5 * 1024 ** 3, "5.0 GB"],
  ])("%i → %s", (n, s) => {
    expect(formatBytes(n)).toBe(s);
  });
});
