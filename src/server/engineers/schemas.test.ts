import { describe, expect, it } from "vitest";

import { engineerProfileSchema, serviceSchema, slugSchema } from "./schemas";

describe("slugSchema", () => {
  it.each(["abc", "dj-kofi", "studio-9", "a1b2c3"])("accepts %j", (slug) => {
    expect(slugSchema.parse(slug)).toBe(slug);
  });

  it("lowercases and trims", () => {
    expect(slugSchema.parse("  DJ-Kofi ")).toBe("dj-kofi");
  });

  it.each(["ab", "x".repeat(41), "-abc", "abc-", "a--b", "a_b", "a b", "a.b", "../admin", "café", "admin", "Mixdrop", "support"])(
    "rejects %j",
    (slug) => {
      expect(slugSchema.safeParse(slug).success).toBe(false);
    },
  );
});

describe("engineerProfileSchema", () => {
  it("splits, trims and de-duplicates genres", () => {
    const parsed = engineerProfileSchema.parse({ slug: "kofi", bio: " hi ", genres: "hip-hop, pop ,, hip-hop" });
    expect(parsed).toEqual({ slug: "kofi", bio: "hi", genres: ["hip-hop", "pop"] });
  });

  it("allows an empty bio and no genres", () => {
    expect(engineerProfileSchema.parse({ slug: "kofi", bio: "", genres: "" }).genres).toEqual([]);
  });

  it("rejects more than 8 genres or a genre over 30 chars", () => {
    const nine = Array.from({ length: 9 }, (_, i) => `g${i}`).join(",");
    expect(engineerProfileSchema.safeParse({ slug: "kofi", bio: "", genres: nine }).success).toBe(false);
    expect(engineerProfileSchema.safeParse({ slug: "kofi", bio: "", genres: "x".repeat(31) }).success).toBe(false);
  });

  it("rejects a bio over 2000 chars", () => {
    expect(engineerProfileSchema.safeParse({ slug: "kofi", bio: "x".repeat(2001), genres: "" }).success).toBe(false);
  });
});

describe("serviceSchema", () => {
  const valid = {
    name: " Full mix ",
    type: "mix",
    price: "49.99",
    turnaroundDays: "7",
    revisionsIncluded: "2",
    maxStems: "48",
  };

  it("parses form strings into typed values with price in pence", () => {
    expect(serviceSchema.parse(valid)).toEqual({
      name: "Full mix",
      type: "mix",
      price: 4999,
      turnaroundDays: 7,
      revisionsIncluded: 2,
      maxStems: 48,
    });
  });

  it("accepts the price bounds £5 and £10,000", () => {
    expect(serviceSchema.parse({ ...valid, price: "5" }).price).toBe(500);
    expect(serviceSchema.parse({ ...valid, price: "10000" }).price).toBe(1_000_000);
  });

  it.each([
    ["price below £5", { price: "4.99" }],
    ["price above £10,000", { price: "10000.01" }],
    ["unparseable price", { price: "fifty" }],
    ["price with 3 decimals", { price: "10.999" }],
    ["unknown type", { type: "remix" }],
    ["turnaround 0", { turnaroundDays: "0" }],
    ["turnaround 61", { turnaroundDays: "61" }],
    ["fractional turnaround", { turnaroundDays: "1.5" }],
    ["empty turnaround", { turnaroundDays: "" }],
    ["exponent revisions", { revisionsIncluded: "1e1" }],
    ["empty revisions (not coerced to 0)", { revisionsIncluded: "" }],
    ["11 revisions", { revisionsIncluded: "11" }],
    ["negative revisions", { revisionsIncluded: "-1" }],
    ["0 stems", { maxStems: "0" }],
    ["201 stems", { maxStems: "201" }],
    ["blank name", { name: "  " }],
  ])("rejects %s", (_label, override) => {
    expect(serviceSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it("ignores a client-supplied engineerId or currency", () => {
    const parsed = serviceSchema.parse({ ...valid, engineerId: "someone-else", currency: "usd", active: "true" });
    expect(parsed).not.toHaveProperty("engineerId");
    expect(parsed).not.toHaveProperty("currency");
    expect(parsed).not.toHaveProperty("active");
  });
});
