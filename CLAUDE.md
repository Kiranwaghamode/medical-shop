@AGENTS.md

# Medical Shop — project notes

Inventory, POS billing and sales dashboard for a single medical shop. The full design and the
phase-by-phase build order live in `plan.md` — read it before starting new work.

## Working agreement

- Build in small, verifiable stages. Before starting a phase, outline its stages and get approval.
- After each stage: `npx tsc --noEmit`, `npm run lint`, `npm run build` must pass; test real behaviour
  (run the dev server / hit the endpoint), not just types.
- Next.js 16 has breaking changes — check `node_modules/next/dist/docs/` before using Next APIs.

## Stack (versions matter — several are newer than common examples)

- Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS v4
- shadcn/ui (Radix, `radix-nova` style). Components in `components/ui/`; they import `cn` from the `cn` package.
  Forms use the `field` component + react-hook-form + `@hookform/resolvers` — shadcn's old `form` component no longer exists.
- tRPC v11 with `@trpc/tanstack-react-query` (NOT the classic `@trpc/react-query`):
  `const trpc = useTRPC(); useQuery(trpc.x.y.queryOptions(input))`;
  invalidate with `queryClient.invalidateQueries(trpc.x.queryFilter())`.
- Zod v4 (`z.url()`, `z.flattenError()` — not the v3 APIs).
- Prisma 7.10 (pinned; ignore the CLI's 8.0 RC upgrade notice) + `@prisma/adapter-neon`. Database is Neon PostgreSQL.
- Clerk for auth (Google + mobile OTP) — added in Phase 2.

## Layout

- `server/trpc.ts` — tRPC init, context, procedures. `server/root.ts` — `appRouter`. `server/routers/*` — one router per area.
- `app/api/trpc/[trpc]/route.ts` — tRPC HTTP endpoint. `lib/trpc-client.tsx` — browser client + `TRPCReactProvider`.
- `services/*` — business logic (added from Phase 5). Routers validate input and delegate; no business logic in React components.
- `lib/db.ts` — Prisma client (`db`). Import the client from `@/generated/prisma/client` (generated, git-ignored).
- `lib/env.ts` — Zod-validated env, checked at server start via `instrumentation.ts`. Read env through `env`, not `process.env`.

## Database

- Two URLs: `DATABASE_URL` = Neon **pooled** (`-pooler` host) for the app; `DIRECT_URL` = **direct** for the Prisma CLI
  (`prisma7.config.ts` — Prisma 7.10's default config filename).
- Schema changes: edit `prisma/schema.prisma`, then `npm run db:migrate -- --name <change>`.
  `migrate dev` does not regenerate the client in Prisma 7 — run `npm run db:generate` afterwards.
- `.env` holds real secrets: never print, commit or overwrite it. `.env.example` documents the variables.

## Business rules that must not be broken (details in plan.md §9, §16, §17, §22, §29)

- The backend recalculates prices, tax, discount and totals — never trust client-sent values.
- Sale creation, sale items, stock deduction and invoice number happen in ONE database transaction.
- Stock is deducted with a conditional update (`quantity >= n`) to prevent overselling.
- Expired batches can never be sold. Money uses Prisma `Decimal` (or integer paise), never floats.
- Every query is scoped to the signed-in user's `shopId`.
- Bills print via `window.print()` and print CSS — no PDF generation.

## Commands

- `npm run dev` — dev server (http://localhost:3000)
- `npm run build` / `npm start` — production build / run
- `npm run lint`, `npx tsc --noEmit` — checks
- `npm run db:migrate`, `npm run db:generate`, `npm run db:studio` — Prisma
