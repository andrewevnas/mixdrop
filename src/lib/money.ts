// Money is stored as integer minor units (pence). Parsing is string-based: no float maths.

const PRICE_RE = /^£?\s*(\d{1,7})(?:\.(\d{1,2}))?$/;

/** "49.99" | "£49.99" | "50" | "50.5" → pence. Returns null for anything else. */
export function parsePriceToPence(input: string): number | null {
  const match = PRICE_RE.exec(input.trim());
  if (!match) return null;
  const [, pounds, fraction = ""] = match;
  return Number(pounds) * 100 + Number(fraction.padEnd(2, "0"));
}

/** Pence → "49.99", for pre-filling edit forms. */
export function penceToInput(pence: number): string {
  return `${Math.floor(pence / 100)}.${String(pence % 100).padStart(2, "0")}`;
}

export function formatPrice(pence: number, currency = "gbp"): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(
    pence / 100,
  );
}
