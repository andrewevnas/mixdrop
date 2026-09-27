# Decisions

Short log of non-obvious choices (newest last).

## 2026-09-27 — Phase 0 scaffold
- Next.js 16 (App Router, `src/`), Tailwind v4, shadcn/ui (`base-nova`, uses the `cn` package instead of clsx + tailwind-merge).
- `typecheck` runs `next typegen` first so the generated route types (`LayoutProps`, etc.) exist on a clean checkout.
- CI (GitHub Actions, Node 22) runs lint, typecheck and unit tests. Playwright e2e is local-only for now (`pnpm e2e`).
- Design docs live in `docs/`; subagents in `.claude/agents/`; `/phase` command in `.claude/commands/`.

## 2026-09-27 — No hosted CI
- GitHub Actions removed: it tried to bill the account card, even for a public repo.
- `pnpm check` (lint + typecheck + unit tests) runs as a git pre-push hook in `.githooks/`; `pnpm install` sets `core.hooksPath` via `prepare`.
- A failing check blocks the push. `git push --no-verify` bypasses it; don't, except in an emergency.

## 2026-09-27 — Phase 1: auth + roles
- Role picked at signup is only a *hint* in Supabase `user_metadata` (users can edit it). On email confirmation `/auth/callback` creates an insert-only `profiles` row from it; authorization reads `profiles` only, so a role can't change later.
- Every table enables RLS with no policies: the publishable key can't reach app data through Supabase's REST API. The app uses its own server-side Drizzle connection.
- Role checks run in each page (and data function), not just layouts — layouts don't re-render on client navigation. `forbidden()` (experimental `authInterrupts`) gives a real 403.
- Local Supabase via CLI with unused services (storage, realtime, edge functions, analytics, Studio) off to save memory. Playwright runs 1 worker: parallel Chromium launches crashed on this Windows box.
- KNOWN GAP (security review, MED): auth server actions call Supabase from the app server, so Supabase's per-IP rate limits see one IP. Add app-side rate limiting per client IP + email (or captcha) before production — scheduled for Phase 8 hardening.

## 2026-09-27 — Phase 2: engineer profiles + services
- Prices are typed as text and parsed to pence with a regex (no float maths); £5–£10,000, GBP only. DB CHECKs mirror every Zod limit (price, lengths, genre count) so scripts or future admin paths can't bypass them.
- Data functions take the session user id and scope every query by it; another engineer's service id just matches no rows (tested in `pnpm test:db`, which runs against local Supabase and isn't in the pre-push hook).
- `/e/{slug}` selects an explicit column list (never Stripe fields), active services only, and renders per request (`connection()`) so hidden services and price changes show immediately.
- Portfolio items deferred until uploads exist (Phase 4+).
- FOLLOW-UP (security review, LOW): changing a slug frees the old one for anyone, so shared links could be hijacked. A small reserved-word list blocks obvious impersonation; keep a slug history (hold or redirect old slugs) before launch.

## 2026-09-27 — Phase 3: orders + state machine
- Rules live in pure `src/server/orders/rules.ts` (table mirrors docs/order-state-machine.md; a unit test parses the doc and fails if they drift). `transitionOrder()` in `machine.ts` is the only status writer: row lock + `WHERE status = from`, participant check, one `order_events` row per transition.
- Orders snapshot the service's price and terms (turnaround, revisions, max stems, currency) so later service edits can't change an existing order. The client form echoes the price it showed; if the DB price differs, the order is refused instead of created at a price the client never saw.
- Deadlines: refund-eligible when now > deadline + 10 days, deadline = `due_at`, or `paid_at` + turnaround if never accepted. Auto-approve after 7 days. Both take an injected clock for Phase 7 jobs.
- Side effects (notify, refund, payout) are returned as data from each transition; Phase 6/7 dispatch them.
- `order_events.seq` (identity) gives a stable order when timestamps tie. Engineers never see or act on drafts.
- TEMPORARY: `DEV_FAKE_PAYMENTS` "Simulate payment" button (server-checked, never in production). Delete `src/server/orders/dev-payments.ts` and its button in Phase 6; the webhook's draft→paid must verify amount paid == `order.price_pence`.
- FOLLOW-UP (review, LOW): no cap on draft orders per client — add with Phase 8 rate limiting.

## 2026-09-27 — Phase 4: client uploads + folder download
- Uppy v6 `@uppy/aws-s3` with `signRequest`: the browser asks us to presign each S3 multipart op. The server only signs create/part/list/complete/abort, for the caller's own *pending* file, on a key it built at registration (`orders/{order}/{kind}/{fileId}/{safeName}`). Never single PUT or DeleteObject; expiry fixed at 15 min.
- The multipart upload id is bound to the file row on first use. `/complete` locks the row (no more signing), aborts every other multipart upload on the key, then HEADs and only marks complete if the size matches — so a second, oversized upload can't be swapped in after verification (security review, MED).
- Resume: Golden Retriever remembers in-flight uploads; browsers can't keep a 5 GB File across a refresh, so the client re-adds the same folder. Registration is idempotent on (path, size, kind): finished files are skipped and partial ones resume via ListParts. Sign-out clears this browser-side state.
- Download: File System Access API writes each file straight from R2 into a fresh `Mixdrop-<order>` subfolder (never into the picked folder itself, so client-chosen paths can't overwrite the engineer's files). Re-running skips files already there at the right size. Browsers without the API get per-file attachment links.
- Limits: 10 GB/file, 20 GB and 5,000 files/order; paths sanitised server-side (traversal, Windows device names, `.git`/`.vscode`, 255-char segments) and again on the downloading client.
- FOLLOW-UP: a job to fail stale pending rows (Phase 7), plus the R2 lifecycle rule in docs/r2-setup.md to abort abandoned multipart uploads.
- Uppy sends files ≤ 5 MiB as a single PUT (not multipart). We sign those only for small pending files, with Content-Length in the signature — `pnpm r2:check` confirms R2 rejects any other body size (403).
- The Uppy instance is destroyed on a deferred timer, not synchronously: React Strict Mode (dev) unmounts/remounts, and a synchronous destroy left the Dashboard dead.
- Local disk is nearly full; `pnpm e2e:big` builds its 5 GB session from NTFS sparse files and verifies R2 sizes with 1-byte ranged GETs rather than writing 5 GB back to disk.
