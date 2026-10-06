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
  invalidate a procedure with `queryClient.invalidateQueries(trpc.x.y.queryFilter())`, a whole router with
  `trpc.x.pathFilter()` (routers have no `queryFilter`).
- Zod v4 (`z.url()`, `z.flattenError()` — not the v3 APIs).
- Prisma 7.10 (pinned; ignore the CLI's 8.0 RC upgrade notice) + `@prisma/adapter-neon`. Database is Neon PostgreSQL.
- Clerk (`@clerk/nextjs` v7, "Core 3") — **Google sign-in only** (mobile OTP was dropped).
  `<SignedIn>`/`<SignedOut>`/`<Protect>` were REMOVED in Core 3 (they still type-check but throw at runtime):
  use `<Show when="signed-in">` / `<Show when="signed-out">`. `clerkMiddleware()` lives in `proxy.ts`
  (Next 16 renamed `middleware.ts` → `proxy.ts`). Sign-in page: `app/(auth)/login/[[...login]]/page.tsx`.
- Access = signed in AND email in `ALLOWED_EMAILS` (email comes from the custom session-token claim `email`).
  `createRouteMatcher` is deprecated — do NOT put access rules in `proxy.ts`. Check where the resource lives:
  pages via `app/(dashboard)/layout.tsx` + `requireAllowedUser()` (`lib/auth.ts`); data via tRPC `protectedProcedure`.
  New app pages go inside `app/(dashboard)/` (they get the sidebar + header automatically). Sidebar links and
  header titles both come from `lib/navigation.ts`. Set `export const metadata = { title: "X" }` per page
  (root layout adds "— Medical Shop"). App chrome is `print:hidden`, so printable pages need no extra work.

## Layout

- `server/trpc.ts` — tRPC init, context, procedures. `server/root.ts` — `appRouter`. `server/routers/*` — one router per area.
- `app/api/trpc/[trpc]/route.ts` — tRPC HTTP endpoint. `lib/trpc-client.tsx` — browser client + `TRPCReactProvider`.
- `services/*` — business logic. Routers validate input and delegate; no business logic in React components.
  `services/user.service.ts` `ensureUser()` creates the app User (and the single shared Shop on the very first sign-in).
- Inside `protectedProcedure`, use `ctx.shopId` / `ctx.user` (app user, not the Clerk id). Pages get the same via
  `await requireAllowedUser()`. Every query must be filtered by shopId (batches via `medicine: { shopId }`).
- `lib/db.ts` — Prisma client (`db`). Import the client from `@/generated/prisma/client` (generated, git-ignored).
- `lib/env.ts` — Zod-validated env, checked at server start via `instrumentation.ts`. Read env through `env`, not `process.env`.

## Database

- Two URLs: `DATABASE_URL` = Neon **pooled** (`-pooler` host) for the app; `DIRECT_URL` = **direct** for the Prisma CLI
  (`prisma7.config.ts` — Prisma 7.10's default config filename).
- Schema changes: edit `prisma/schema.prisma`, then `npm run db:migrate -- --name <change>`.
  `migrate dev` does not regenerate the client in Prisma 7 — run `npm run db:generate` afterwards.
- `.env` holds real secrets: never print, commit or overwrite it. `.env.example` documents the variables.
- CHECK constraints (stock ≥ 0, sellingPrice ≤ mrp, total = subtotal − discount, lineTotal = unitPrice × qty, …) live
  only in `prisma/migrations/*_safety_checks/migration.sql` — Prisma's schema can't express them. A violation throws
  a Prisma error naming the constraint; services should turn it into a friendly message. Add new rules the same way
  (`prisma migrate dev --create-only`, then write the SQL).
- Node scripts that import `lib/db.ts` (seed, one-off checks) must run with `tsx --conditions=react-server`,
  because `lib/env.ts` imports `server-only`.

## Business rules that must not be broken (details in plan.md §9, §16, §17, §22, §29)

- The backend recalculates prices, tax, discount and totals — never trust client-sent values.
- Sale creation, sale items, stock deduction and invoice number happen in ONE database transaction.
- Stock is deducted with a conditional update (`quantity >= n`) to prevent overselling.
- Expired batches can never be sold. Money uses Prisma `Decimal` (or integer paise), never floats.
- Every query is scoped to the signed-in user's `shopId`.
- Bills print via `window.print()` and print CSS — no PDF generation.

## Service conventions

- Services take `shopId` as the first argument and filter every query by it.
- Expected failures throw `AppError` (`lib/errors.ts`: NOT_FOUND / CONFLICT / BAD_REQUEST); `protectedProcedure`
  turns them into TRPCErrors with the same code and message. Map DB constraint violations with `friendlyDbError`.
  With the Neon adapter a CHECK violation is Prisma `P2039` (Postgres `23514`); the constraint name is in the message.
- Money leaves services as strings with 2 decimals ("33.60"); never send Decimal objects to the client.
- Shared Zod schemas live in `lib/validations.ts` (used by routers and forms).
- Stock: batch `quantity` is in UNITS; MRP/prices are PER PACK; `Medicine.packSize` converts. Sellable stock excludes
  expired batches (`lib/inventory-status.ts`). "Today" for expiry is `todayInIndia()` (`lib/dates.ts`).

## Tests (Vitest)

- `npm test` — unit tests (`*.test.ts`), no database, < 1 s.
- `npm run test:db` — integration tests (`*.db.test.ts`) against the real Neon DB; each file creates its own
  temporary shop(s) and deletes them in `afterAll`. Pre-create the test user in the test shop so `ensureUser()`
  never attaches it to the real shop. Slow (~1 min) because Neon is remote.
- Router tests use `createCaller` from `server/root.ts` with a fake `access` context.

## Commands

- `npm run dev` — dev server (http://localhost:3000)
- `npm run build` / `npm start` — production build / run
- `npm run lint`, `npx tsc --noEmit` — checks
- `npm run db:migrate`, `npm run db:generate`, `npm run db:studio` — Prisma
- `npm run db:seed` — sample medicines / batches (dev only; re-runnable, resets only the sample rows)
