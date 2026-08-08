# Vocab App

Next.js app for learning vocabulary with spaced repetition. Swedish↔French and
English↔French today; see "Languages" below before adding another.

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
- `components/AppShell.tsx`: sticky page header (title + `CoursePicker` + streak/freeze/XP chips fed by `StatsProvider` from the (app) layout). Used by all pages except session/login/results.
- `components/ui/flags.tsx`: `<Flag lang>` SVG marks. Text-only contexts (Segmented labels) use `flagOf()` emoji instead.
- Icons: lucide-react (no emojis in UI chrome; emojis stay in content data)

## Key files
- `lib/sm2.ts` — SM-2 spaced repetition algorithm
- `lib/fuzzy.ts` — Levenshtein fuzzy matching for answer evaluation
- `lib/xp.ts` — XP calculation and level system
- `lib/streak.ts` — Daily streak logic (timezone-aware) + streak freezes (max 2, absorb missed days, +1 earned per 7-day milestone)
- `lib/achievements.ts` — Achievement definitions and unlock checks
- `lib/courses.ts` — Language registry: pairs, courses, directions, locales, verb forms
- `lib/morphology.ts` — Surface form → headword rules, per learned language
- `auth.ts` — NextAuth config (Google provider + PrismaAdapter)
- `scripts/parse-vocabulary.ts` — Parser for the vocabulary files of every pair
- `scripts/merge-core.ts` — Merges agent-generated vocab chunks into a core file (dedup by headword)

## Languages
Two levels, both defined in **`lib/courses.ts`** — the single place to touch when adding a language:
- a **pair** is unoriented and owns the content: `Word.pair` / `Story.pair` / `GrammarLesson.pair`
  (`"sv-fr"`, `"en-fr"`). `Word.term` is in the pair's `term` language, `Word.translation` in its
  `translation` language. One row serves both directions, so content is never duplicated.
- a **course** is oriented and belongs to the user: `User.nativeLanguage` (interface) +
  `User.learningLanguage`, resolved by `resolveCourse()`. There is deliberately no Course table.

The course drives UI strings (`lib/i18n.ts`, via `CourseProvider`/`useCourse`/`useLang` client-side,
`getCourse(userId)` from `lib/current-course.ts` server-side), exercise direction, TTS locale
(`localeOf`), QCM distractor side, and which exercises exist.

**Every query on Word/Story/GrammarLesson must filter by `course.pair`.** Vocabulary stats are
per course (`where: { userId, word: { pair } }`); XP, level, streak and achievements stay global.

Adding a language: add the pair + its courses to `PAIRS`/`COURSES`, a `languageName` entry and a
UI block in `lib/i18n.ts` if it becomes an interface language, its verb forms to `VERB_FORMS`, its
morphology to `lib/morphology.ts`, then the content (see Data sources).

## Study directions
`UserWord.direction` is absolute (`SV_FR` | `FR_SV` | `EN_FR` | `FR_EN`) — each word has one SM-2
progression per direction (unique on `[userId, wordId, direction]`). `courseDirections(course)`
yields the two the user can pick on the mode-picker screen, native-first by default. TTS always
speaks the learned side (`learnedText`). Word counts in stats/achievements use `distinct: ['wordId']`
so directions don't double-count.

## Content tied to the `term` side
Verb forms, Tatoeba sentences, stories and grammar lessons are authored for the pair's `term`
language and written in its `translation` language. `learnsTermLanguage(course)` gates conjugation,
cloze, reading and grammar — a Swedish native learning French gets vocabulary exercises only.
`Word.details` (JSONB `{translations[], context?, usage[{term,translation}]}`) follows the same rule
via `showsEnrichedAnswer()`.

## Reading
`Story` table (48 graded stories, 4 levels) under `/reading`; `StoryReader` makes every word
tappable → `/api/dictionary?q=` backed by `lib/dictionary.ts` (one in-memory map per pair, over
headwords + stored forms, falling back to `lemmaCandidates()` from `lib/morphology.ts`).

## Example sentences & cloze
`Word.examples` (`[{term, translation?, blank}]`) holds real Tatoeba sentences (CC-BY) matched by
headword+forms via `scripts/build-examples.ts` (English pivot only when neither side is English).
`ClozeExercise` blanks the `blank` surface form; available in the mode picker and the MIX rotation
(repetitions ≥ 3).

## Data sources
Vocabulary files live in `C:\Users\Arnau\Desktop\pro\` and are declared in `SOURCES` in
`scripts/parse-vocabulary.ts`:
- `Swedish.txt` — personal vocab list (~930 entries, mixed format)
- `Swedish_core_5000.txt` — core ~5000 most common Swedish words
- `English_core_5000.txt` — same for English

Format is `headword (forms) - translation` under `=== SECTION ===` headers. Swedish infers the word
type from the headword (article prefix, number of parenthesised forms); **English infers it from the
section header** (`=== VERBS ===`, `=== NOUNS … ===`, `=== ADJECTIVES ===`, …) because its verbs and
adjectives both carry two forms. Chunks are merged with `merge-core.ts`, then `pnpm db:seed`.

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

Content scripts take the pair as their last argument (default `sv-fr`):
`build-examples.ts <tatoeba-dir> [pair]`, `apply-frequency.ts <xx_50k.txt> [pair]`,
`import-stories.ts <dir> [pair]`, `import-grammar.ts <dir> [pair]`.

## SM-2 quality scores
- 0 = incorrect (resets interval)
- 3 = approximate (partial credit, doesn't advance)
- 4 = correct (advances normally)
- Mastered = interval > 21 days
