# Fondanarex

Forex macro analysis workstation — a rebuild of the legacy **DIPper In FOnda** Vite SPA on
Next.js, with a real database, authenticated server-side APIs, and a tested scoring engine.

## Stack

| Concern    | Choice                                                        |
| ---------- | ------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack, React 19.2)                |
| Language   | TypeScript 5, `strict` + `noUncheckedIndexedAccess`           |
| Styling    | Tailwind CSS v4 (CSS-first `@theme`, no `tailwind.config.js`) |
| Icons      | Material Symbols                                              |
| Database   | Neon Postgres via Prisma 7 (`prisma-client` + Neon adapter)   |
| Auth       | Auth.js v5 (NextAuth beta) with GitHub OAuth                  |
| AI         | Anthropic SDK (Claude Sonnet 5), Groq, Perplexity             |
| Unit tests | Vitest                                                        |
| E2E        | Playwright                                                    |

## Getting started

```bash
pnpm install          # runs `prisma generate` via postinstall
cp .env.example .env  # then fill in the values
pnpm db:migrate       # apply migrations to your database
pnpm dev
```

### Required environment

At minimum you need `DATABASE_URL`, `DIRECT_URL`, and `AUTH_SECRET` (`npx auth secret`).
Every third-party integration key is optional — a missing key disables that
integration rather than breaking the app.

`DATABASE_URL` should be the Neon **pooled** connection (`-pooler` in the host).
`DIRECT_URL` is the **unpooled** one and is used only by `prisma migrate`, which
cannot run DDL through the pooler.

## Scripts

| Script               | Purpose                         |
| -------------------- | ------------------------------- |
| `pnpm dev`           | Dev server                      |
| `pnpm build`         | Production build                |
| `pnpm typecheck`     | `tsc --noEmit`                  |
| `pnpm lint`          | ESLint                          |
| `pnpm format`        | Prettier write                  |
| `pnpm test`          | Vitest (watch)                  |
| `pnpm test:run`      | Vitest (once)                   |
| `pnpm test:coverage` | Vitest with coverage thresholds |
| `pnpm e2e`           | Playwright                      |
| `pnpm db:migrate`    | Create + apply a migration      |
| `pnpm db:deploy`     | Apply migrations (production)   |
| `pnpm db:seed`       | Seed reference data             |
| `pnpm db:studio`     | Prisma Studio                   |

## Architecture

```
app/          Next.js App Router — routes, layouts, route handlers
components/   React components (ui/ holds primitives)
domain/       Pure business logic. No I/O, no React, no Prisma. Fully unit-tested.
lib/          Server-side plumbing: db client, env validation, integrations
prisma/       Schema, migrations, seed
e2e/          Playwright specs
```

**`domain/` is the core.** The scoring engine is pure and deterministic: it takes data
in and returns scores out, with no database or network access. That is what makes it
testable, and it is the part of the app whose correctness matters most.

### Scoring model

Each currency has its own weighted indicator profile (weights sum to 100). The score is
a weighted mean of directional indicator scores in `[-10, +10]`, normalised to `0–100`.

The load-bearing rule: **an indicator with no data is excluded from the calculation** —
its weight is removed from the denominator rather than being counted as zero, which
would drag the currency artificially toward neutral.

### Notable decisions carried over from the audit

- Pip size and contract size live in an `Instrument` table, so P&L is computed per
  instrument instead of via a hardcoded "1 pip = $10/lot" constant.
- Screenshots go to object storage; the legacy app stored base64 in `localStorage` and
  silently deleted old images when the quota filled.
- API refreshes write to `IndicatorValue`; manual edits write to `IndicatorOverride` and
  always win on read. An API refresh structurally cannot clobber manual input.

## Deployment

Netlify is configured in `netlify.toml`. Set the environment variables from
`.env.example` in the site settings. `DATABASE_URL` and `AUTH_SECRET` are required for
the app to serve requests; the build itself does not need them.
