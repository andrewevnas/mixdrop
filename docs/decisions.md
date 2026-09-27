# Decisions

Short log of non-obvious choices (newest last).

## 2026-09-27 — Phase 0 scaffold
- Next.js 16 (App Router, `src/`), Tailwind v4, shadcn/ui (`base-nova`, uses the `cn` package instead of clsx + tailwind-merge).
- `typecheck` runs `next typegen` first so the generated route types (`LayoutProps`, etc.) exist on a clean CI checkout.
- CI (GitHub Actions, Node 22) runs lint, typecheck and unit tests. Playwright e2e is local-only for now (`pnpm e2e`) and moves into CI once there are real flows.
- Design docs live in `docs/`; subagents in `.claude/agents/`; `/phase` command in `.claude/commands/`.
