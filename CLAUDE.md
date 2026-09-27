# Mixdrop — Claude Code guide

Marketplace where artists order mixing/mastering from engineers: pay upfront, upload stems,
track progress, review and approve mixes in-browser. Currently a PROTOTYPE.

## Stack
- Next.js (App Router) + TypeScript (strict), Tailwind + shadcn/ui
- Postgres (Supabase) via Drizzle ORM; Supabase Auth
- Cloudflare R2 (S3 API) for all files; Uppy (S3 multipart) for uploads
- Stripe Connect (Express) + Stripe Checkout
- Background jobs: worker container with ffmpeg (transcode, LUFS, waveform peaks)
- Email: Resend. Tests: Vitest (unit), Playwright (e2e)

## Commands
- `pnpm dev` | `pnpm check` (lint+typecheck+unit) | `pnpm test:db` + `pnpm e2e` (need `pnpm sb:start`, Docker)
- `pnpm sb:start` / `pnpm sb:stop` / `pnpm sb:status` for local Supabase (Mailpit inbox: http://127.0.0.1:54324)
- `pnpm db:generate` then `pnpm db:migrate` for schema changes
- `stripe listen --forward-to localhost:3000/api/webhooks/stripe` for payment work

## Non-negotiable rules
1. File bytes NEVER pass through the app server. Uploads/downloads use presigned R2 URLs only.
2. Every read/write of orders, files, deliveries goes through `src/server/data/*` which
   enforces "caller is a participant of this order". No raw DB queries in routes/components.
3. Order status changes ONLY via `transitionOrder()` in `src/server/orders/machine.ts`.
   Every transition writes an `order_events` row. Never set `orders.status` directly.
4. Prices and money come from the DB, never the client. Store money as integer minor units (pence).
5. Stripe state changes are driven by verified webhooks, handled idempotently (event id stored).
6. Validate all inputs with Zod at the boundary. Never trust role/userId from the client.
7. No secrets in code or logs. New env vars go in `.env.example` with a comment.
8. Uploaded files are private; download URLs expire in <= 15 min and use
   `Content-Disposition: attachment`. Never unzip or execute uploaded files server-side.

## Where things live
- `src/app/` routes/UI · `src/server/` domain logic · `src/server/data/` authorised data access
- `src/db/schema.ts` Drizzle schema · `worker/` ffmpeg jobs · `docs/` design notes
- Read `docs/ARCHITECTURE.md` or `docs/order-state-machine.md` ONLY when the task touches them.

## How to work (token-efficient)
- One phase/feature per session. Start in Plan mode; wait for my approval before editing.
- Before exploring broadly, delegate search to a subagent and return a short summary.
- Read only the files you need; ask me before reading more than ~8 files for one task.
- Prefer small diffs. Don't rewrite files that only need a few lines changed.
- After each change: run `pnpm typecheck && pnpm test` for touched areas; fix before moving on.
- Anything touching auth, files, payments or order status: run the `security-reviewer`
  subagent on the diff before declaring done.
- Finish each task with: what changed, how to verify, and the "done" check from the phase list.
- Log non-obvious decisions as a 3–5 line entry in `docs/decisions.md`.

## Current phase
<!-- Update this line as you go -->
Phase 4 — client uploads. (Phase 3 orders + state machine done 2026-09-27.)

@AGENTS.md
