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
