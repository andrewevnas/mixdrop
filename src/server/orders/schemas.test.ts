import { describe, expect, it } from "vitest";

import { fakePaymentsEnabled } from "./dev-payments";
import { newOrderSchema, orderActionSchema } from "./schemas";

const valid = {
  serviceId: "5b0f4c7e-8a4a-4f7a-9d42-0b8b3f0c1d2e",
  expectedPricePence: "4999",
  songTitle: " Night Drive ",
  artistName: "Ana",
  notes: "Warm, wide chorus.",
  referenceLinks: "https://example.com/a\r\n\n  https://example.com/b  ",
};

describe("newOrderSchema", () => {
  it("trims fields and splits reference links", () => {
    expect(newOrderSchema.parse(valid)).toEqual({
      ...valid,
      expectedPricePence: 4999,
      songTitle: "Night Drive",
      referenceLinks: ["https://example.com/a", "https://example.com/b"],
    });
  });

  it.each([
    ["javascript: link", { referenceLinks: "javascript:alert(1)" }],
    ["data: link", { referenceLinks: "data:text/html,<script>alert(1)</script>" }],
    ["non-URL", { referenceLinks: "not a url" }],
    ["4 links", { referenceLinks: "https://a.co\nhttps://b.co\nhttps://c.co\nhttps://d.co" }],
    ["bad service id", { serviceId: "abc" }],
    ["missing expected price", { expectedPricePence: undefined }],
    ["non-numeric expected price", { expectedPricePence: "49.99" }],
    ["blank title", { songTitle: "  " }],
    ["long artist", { artistName: "x".repeat(121) }],
    ["long notes", { notes: "x".repeat(4001) }],
  ])("rejects %s", (_label, override) => {
    expect(newOrderSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it("ignores client-supplied price or engineer", () => {
    const parsed = newOrderSchema.parse({ ...valid, pricePence: "1", engineerId: "x", status: "paid" });
    expect(parsed).not.toHaveProperty("pricePence");
    expect(parsed).not.toHaveProperty("engineerId");
    expect(parsed).not.toHaveProperty("status");
  });
});

describe("orderActionSchema", () => {
  it("only accepts known statuses", () => {
    expect(orderActionSchema.safeParse({ orderId: valid.serviceId, to: "approved" }).success).toBe(true);
    expect(orderActionSchema.safeParse({ orderId: valid.serviceId, to: "hacked" }).success).toBe(false);
  });
});

describe("fakePaymentsEnabled", () => {
  it.each([
    [{ DEV_FAKE_PAYMENTS: "true", NODE_ENV: "development" }, true],
    [{ DEV_FAKE_PAYMENTS: "true", NODE_ENV: "test" }, true],
    [{ DEV_FAKE_PAYMENTS: "true", NODE_ENV: "production" }, false],
    [{ DEV_FAKE_PAYMENTS: "1", NODE_ENV: "development" }, false],
    [{ NODE_ENV: "development" }, false],
  ])("%j → %s", (env, expected) => {
    expect(fakePaymentsEnabled(env)).toBe(expected);
  });
});
