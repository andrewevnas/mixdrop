import { describe, expect, it } from "vitest";

import { formatPrice, parsePriceToPence, penceToInput } from "./money";

describe("parsePriceToPence", () => {
  it.each([
    ["10", 1000],
    ["10.5", 1050],
    ["10.05", 1005],
    ["49.99", 4999],
    ["£49.99", 4999],
    [" 0.01 ", 1],
    ["9999999.99", 999999999],
  ])("%j → %i", (input, pence) => {
    expect(parsePriceToPence(input)).toBe(pence);
  });

  it.each(["", "0.999", "-1", "1e3", "1,000", "10.", ".5", "abc", "12345678", "NaN", "Infinity", "0x10"])(
    "rejects %j",
    (input) => {
      expect(parsePriceToPence(input)).toBeNull();
    },
  );

  it("avoids float rounding errors", () => {
    // 0.29 * 100 === 28.999999999999996 in floating point
    expect(parsePriceToPence("0.29")).toBe(29);
    expect(parsePriceToPence("1.13")).toBe(113);
  });
});

describe("penceToInput", () => {
  it.each([
    [4999, "49.99"],
    [5000, "50.00"],
    [1005, "10.05"],
    [1, "0.01"],
  ])("%i → %s and round-trips", (pence, text) => {
    expect(penceToInput(pence)).toBe(text);
    expect(parsePriceToPence(text)).toBe(pence);
  });
});

describe("formatPrice", () => {
  it("formats GBP pence", () => {
    expect(formatPrice(4999)).toBe("£49.99");
    expect(formatPrice(100000, "gbp")).toBe("£1,000.00");
  });
});
