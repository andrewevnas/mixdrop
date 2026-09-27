import { describe, expect, it } from "vitest";

import { toSignRequest } from "./sign-request";

const key = "orders/o/stems/f/kick.wav";

describe("toSignRequest (Uppy request → allowed multipart op)", () => {
  it.each([
    [{ method: "PUT", key }, { op: "putObject", key }],
    [{ method: "POST", key }, { op: "createMultipart", key }],
    [{ method: "PUT", key, uploadId: "u", partNumber: 3 }, { op: "uploadPart", key, uploadId: "u", partNumber: 3 }],
    [{ method: "GET", key, uploadId: "u" }, { op: "listParts", key, uploadId: "u" }],
    [{ method: "POST", key, uploadId: "u" }, { op: "completeMultipart", key, uploadId: "u" }],
    [{ method: "DELETE", key, uploadId: "u" }, { op: "abortMultipart", key, uploadId: "u" }],
  ])("maps %j", (input, expected) => {
    expect(toSignRequest(input)).toEqual(expected);
  });

  it.each([
    ["single PUT with a part number", { method: "PUT", key, partNumber: 1 }],
    ["DeleteObject", { method: "DELETE", key }],
    ["GetObject", { method: "GET", key }],
    ["HEAD", { method: "HEAD", key }],
    ["PUT without partNumber", { method: "PUT", key, uploadId: "u" }],
    ["part 0", { method: "PUT", key, uploadId: "u", partNumber: 0 }],
    ["part 10001", { method: "PUT", key, uploadId: "u", partNumber: 10_001 }],
    ["fractional part", { method: "PUT", key, uploadId: "u", partNumber: 1.5 }],
    ["partNumber on a create", { method: "POST", key, partNumber: 1 }],
    ["partNumber on list", { method: "GET", key, uploadId: "u", partNumber: 1 }],
    ["empty key", { method: "POST", key: "" }],
    ["missing key", { method: "POST" }],
    ["garbage", "nope"],
    ["null", null],
  ])("refuses %s", (_label, input) => {
    expect(toSignRequest(input)).toBeNull();
  });

  it("drops unknown fields (e.g. a client-chosen expiresIn or bucket)", () => {
    expect(toSignRequest({ method: "POST", key, expiresIn: 604800, bucket: "other" })).toEqual({
      op: "createMultipart",
      key,
    });
  });
});
