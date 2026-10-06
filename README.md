# Medical Shop

Inventory, billing (POS) and sales dashboard for a medical shop.
Built with Next.js, tRPC, Prisma, PostgreSQL (Neon) and Clerk. See [`plan.md`](plan.md) for the full design.

## Setup

Requires Node.js 20+ and a [Neon](https://neon.tech) PostgreSQL database.

```bash
npm install                 # also generates the Prisma client
cp .env.example .env        # then fill in the real values (see comments in the file)
npm run db:migrate          # create the database tables
npm run dev                 # http://localhost:3000
```

The app checks its environment variables at startup and stops with a clear message if any are missing or wrong.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / run it |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Apply schema changes to the database |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:studio` | Browse the database |
