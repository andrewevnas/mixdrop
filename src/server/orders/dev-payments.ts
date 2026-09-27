// TEMPORARY until Stripe (Phase 6): lets a client mark their own draft order as paid in local dev.
// Delete this file and its "Simulate payment" button when the Stripe webhook lands.

export function fakePaymentsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.DEV_FAKE_PAYMENTS === "true" && env.NODE_ENV !== "production";
}
