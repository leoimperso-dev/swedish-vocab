# Swedish Vocab App

Next.js app for learning Swedish vocabulary with spaced repetition.

## Stack
- Next.js 16 App Router, TypeScript, Tailwind CSS
- Auth: NextAuth v5 (beta) + Google OAuth
- DB: PostgreSQL via Supabase + Prisma ORM (**pinned to v6** — v7 dropped `url` in schema datasource and requires driver adapters; do not upgrade without migrating the config)
- Animations: Framer Motion

## Key files
- `lib/sm2.ts` — SM-2 spaced repetition algorithm
- `lib/fuzzy.ts` — Levenshtein fuzzy matching for answer evaluation
- `lib/xp.ts` — XP calculation and level system
- `lib/streak.ts` — Daily streak logic (timezone-aware)
- `lib/achievements.ts` — Achievement definitions and unlock checks
- `auth.ts` — NextAuth config (Google provider + PrismaAdapter)
- `scripts/parse-vocabulary.ts` — Parser for Swedish.txt and Swedish_core_5000.txt
- `scripts/merge-core.ts` — Merges agent-generated vocab chunks into Swedish_core_5000.txt (dedup by headword)

## Data sources
- `C:\Users\Arnau\Desktop\pro\Swedish.txt` — Personal vocab list (~930 entries, mixed format)
- `C:\Users\Arnau\Desktop\pro\Swedish_core_5000.txt` — Core ~5000 most common Swedish words (generated in themed chunks, merged via merge-core.ts)

## Commands
```
pnpm dev                      # dev server
pnpm db:apply <file.sql>      # apply SQL to Supabase via node-postgres
pnpm db:seed                  # parse .txt files and seed DB
pnpm parse                    # test vocabulary parser
```

## DB connectivity (critical on this machine)
The Prisma Rust engine **cannot** reach Supabase from this machine (P1001 on direct
host and poolers), while node-postgres connects fine. Consequences:
- `prisma db push` / `prisma studio` / `prisma migrate dev` DO NOT work here
- Runtime uses the `driverAdapters` preview feature: `lib/db.ts` builds PrismaClient
  with `@prisma/adapter-pg` and pins the Supabase root CA (`certs/supabase-ca.pem`)
- Schema changes: edit `schema.prisma`, then generate SQL offline with
  `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`
  (or write the ALTER by hand for incremental changes) and apply with `pnpm db:apply`
- Supabase direct host is IPv6-only; node reaches it, and the pooler hostnames
  answered "tenant not found" for this project — use the direct URL locally

## TLS note
This machine requires `NODE_OPTIONS=--use-system-ca` for Prisma binary downloads. All `db:*` scripts already include it. `next.config.ts` sets `experimental.turbopackUseSystemTlsCerts` for the same reason (Google Fonts fetch at build time).

## Answer evaluation
- `evaluateAnswer(input, expected)` returns 'correct' | 'approximate' | 'incorrect'
- Levenshtein distance ≤ 2 = approximate (not wrong)
- For verbs: each form (present/prétérit/supin) evaluated separately via `evaluateVerbForms`

## SM-2 quality scores
- 0 = incorrect (resets interval)
- 3 = approximate (partial credit, doesn't advance)
- 4 = correct (advances normally)
- Mastered = interval > 21 days
