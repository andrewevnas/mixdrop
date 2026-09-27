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
