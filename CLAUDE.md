# Swedish Vocab App

Next.js app for learning Swedish vocabulary with spaced repetition.

## Stack
- Next.js 16 App Router, TypeScript, Tailwind CSS v4
- Auth: NextAuth v5 (beta) + Google OAuth
- DB: PostgreSQL via Supabase + Prisma ORM (**pinned to v6** — v7 dropped `url` in schema datasource and requires driver adapters; do not upgrade without migrating the config)
- Animations: Framer Motion (exercises) + CSS keyframes (`animate-rise/pop/shake`)

## Design system
Dark-only, mobile-first (max-w-[430px]), ported from the svensk-spark Lovable design.
- Tokens: oklch semantic vars in `app/globals.css` (`@theme inline`) — use `bg-surface`, `text-muted-foreground`, `text-success/warning/danger/streak/freeze/info/accent`, `*-soft` backgrounds; never raw palette classes (slate-*, blue-*)
- Utilities: `card-surface`, `pressable` (cursor + active scale), `text-hero-word`, `bg-gradient-nordic`, `bg-gradient-xp`, `safe-top/bottom`
- Fonts: Inter (`font-sans`) + Space Grotesk (`font-display` — headings, big numbers) via next/font
- Primitives: `components/ui/` (Card, Chip, ProgressBar, Segmented, TextField, Button + `buttonClasses()` for Links — no cva/radix)
- `components/AppShell.tsx`: sticky page header (title + flag toggle + streak/freeze/XP chips fed by `StatsProvider` from the (app) layout). Used by all pages except session/login/results.
- Icons: lucide-react (no emojis in UI chrome; emojis stay in content data)

## Key files
- `lib/sm2.ts` — SM-2 spaced repetition algorithm
- `lib/fuzzy.ts` — Levenshtein fuzzy matching for answer evaluation
- `lib/xp.ts` — XP calculation and level system
- `lib/streak.ts` — Daily streak logic (timezone-aware) + streak freezes (max 2, absorb missed days, +1 earned per 7-day milestone)
- `lib/achievements.ts` — Achievement definitions and unlock checks
- `auth.ts` — NextAuth config (Google provider + PrismaAdapter)
- `scripts/parse-vocabulary.ts` — Parser for Swedish.txt and Swedish_core_5000.txt
- `scripts/merge-core.ts` — Merges agent-generated vocab chunks into Swedish_core_5000.txt (dedup by headword)

## Bilingual mode
`User.nativeLanguage` (`fr` default | `sv`) drives everything: UI strings (`lib/i18n.ts` via
`LangProvider`/`useLang` for client components, `getStrings(asLang(...))` server-side), exercise
direction (`promptText`/`answerText`/`learnedLocale` in `lib/word-display.ts` — prompt is always
the learned language), TTS locale, QCM distractor language (`?lang=` param), and exercise selection
(no CONJUGATION for `sv` natives). Flag button on dashboard toggles via `app/(app)/actions.ts`.
`Word.details` (JSONB `{translations[], context?, usage[{sv,fr}]}`) is written in French —
translations/context only shown in `fr` mode; usage pairs shown in both.

## Study directions
`UserWord.direction` (`SV_FR` | `FR_SV`) — each word has one SM-2 progression per direction
(unique on `[userId, wordId, direction]`). The user picks the direction on the mode-picker screen;
it flows through session/answer APIs and exercise props (`directionPrompt`/`directionAnswer`).
TTS always speaks the learned-language side (`learnedText`). Word counts in stats/achievements
use `distinct: ['wordId']` so directions don't double-count.

## Reading
`Story` table (24 graded stories, 3 levels) under `/reading`; `StoryReader` makes every word
tappable → `/api/dictionary?q=` backed by `lib/dictionary.ts` (in-memory map of headwords+forms
with Swedish suffix stripping: definite/plural/genitive/verb endings, consonant undoubling).

## Example sentences & cloze
`Word.examples` (`[{sv, fr?, blank}]`) holds real Tatoeba sentences (CC-BY) matched by
headword+forms via `scripts/build-examples.ts` (pure script — French through direct links then
English pivot). `ClozeExercise` blanks the `blank` surface form; CLOZE is fr-native only,
available in the mode picker and the MIX rotation (repetitions ≥ 3).

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
