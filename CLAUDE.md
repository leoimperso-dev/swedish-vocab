# Vocab App

Next.js app for learning vocabulary with spaced repetition. Swedish↔French,
English↔French, Dutch→French and Spanish→French today; see "Languages" below
before adding another.

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

## CEFR levels
Every user declares a level per learned language (`User.levels`, a JSON map
`{ "sv": "A2" }`). `Word.cefr` is derived from `frequencyRank` by `lib/cefr.ts`
(A1 ≤ 600, A2 ≤ 1200, B1 ≤ 2500, B2 ≤ 5000, C1 ≤ 10000, C2 beyond / unranked).

The level is a **floor on new words only**: study sessions draw new words from
that band and above, and fall back to the whole pair if the band runs dry. Words
already started keep coming back, and the vocabulary list shows every level with
its own filter chips. `scripts/assign-cefr.ts` recomputes the column — run it
after `apply-frequency`.

## Conversation
`Dialogue` table (96 turn-by-turn conversations, 3 levels) under `/conversation`.
`DialoguePlayer` speaks the `them` lines, prompts the `you` lines in the interface
language, and grades a spoken answer via `lib/use-speech-recognition.ts`
(`evaluateSpokenAnswer`, looser than typing). Recognition is Chrome/Edge/Safari
only, so a typed fallback is always one tap away. Import with
`scripts/import-dialogues.ts <dir>` — the pair comes from each filename.

Each `you` turn carries `accepts[]`, other correct wordings of the same line, so a
learner is not marked wrong for saying it differently (`evaluateSpokenAlternatives`
keeps the best verdict across them). Generated per language and attached with
`scripts/import-dialogue-variants.ts <dir>`; sources in `Desktop\pro\dialoguesariants\`.

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
- `Swedish_wiki.txt` — Wiktionary bulk vocabulary for Swedish
- `English_core_5000.txt` — same for English
- `English_wiki.txt` — Wiktionary bulk vocabulary for English
- `Dutch_core_2000.txt` — same for Dutch (nouns keep their `de`/`het` article in the term)
- `Dutch_wiki.txt` — Wiktionary bulk vocabulary for Dutch
- `Spanish_core.txt` — agent-written Spanish core (nouns keep their `el`/`la` article)
- `Spanish_wiki.txt` — Wiktionary bulk vocabulary for Spanish

`*_wiki.txt` files come from `Desktop\pro\generate-wiki-vocab.py <lang>` (kaikki.org
extracts, CC BY-SA): regenerate + reseed rather than editing them by hand. They are
capped by the OpenSubtitles lists, which stop at rank 50 000 — raising `RANK_CUTOFF`
above that does nothing. Their entries are judged one by one by
`scripts/mark-studyable.ts`, which drops Wiktionary definitions, inflected forms the
curated lists already cover, and the contraction fragments the corpus mis-ranks
(`don` from "don't" at rank 31). After each vocabulary batch, re-run `apply-frequency`
then `build-examples` (in that order — example ownership reads the fresh ranks;
see scripts/key-ownership.ts for how homographs share surface forms).

Format is `headword (forms) - translation` under `=== SECTION ===` headers. Swedish infers the word
type from the headword (article prefix, number of parenthesised forms). **English states it in the
section header**, because its verbs and adjectives both carry two forms: `=== VERBES ===` or
`=== NOMS | MAISON & LOGEMENT ===`, where the part after the pipe is the themed category shown in
the UI. Parenthesised forms are the verb's `(past, pastParticiple)`, the adjective's
`(comparative, superlative)`, or a noun plural worth noting (`city (cities)`) — a plain `+s` is
left out. `pnpm db:seed` is idempotent: `[pair, term, wordType, source]` is unique, so re-running it
only inserts what's new (which also means two senses of one word must share a single entry).

## Commands
```
pnpm dev                      # dev server
pnpm db:apply <file.sql>      # apply SQL to Supabase via node-postgres
pnpm db:seed                  # parse .txt files and seed DB
pnpm parse                    # test vocabulary parser
pnpm tsx scripts/check-story-coverage.ts   # QA: every story token must resolve
pnpm tsx scripts/mark-studyable.ts         # recompute Word.studyable (after each seed)
pnpm tsx scripts/assign-cefr.ts            # recompute Word.cefr (after apply-frequency)
```
After touching stories or vocabulary, run the coverage check — only proper
nouns and numbers may stay unresolved (the reader shows « Nom propre » for
capitalised unknowns and leaves letterless tokens untappable).

## DB connectivity (critical on this machine)
The Prisma Rust engine **cannot** reach Supabase from this machine (P1001 on direct
host and poolers), while node-postgres connects fine. Consequences:
- `prisma db push` / `prisma studio` / `prisma migrate dev` DO NOT work here
- Runtime uses the `driverAdapters` preview feature: `lib/db.ts` builds PrismaClient
  with `@prisma/adapter-pg` and pins the Supabase root CA (`certs/supabase-ca.pem`)
- Schema changes: edit `schema.prisma`, then generate SQL offline with
  `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`
  (or write the ALTER by hand for incremental changes) and apply with `pnpm db:apply`
- Local `DATABASE_URL` targets the Supabase **session pooler**
  (`postgres.<ref>@aws-0-eu-west-1.pooler.supabase.com:5432`) — IPv4, works on
  every network, unlike the direct host which is IPv6-only. The old "tenant not
  found" pooler note was a wrong-username issue.

## TLS note
This machine requires `NODE_OPTIONS=--use-system-ca` for Prisma binary downloads. All `db:*` scripts already include it. `next.config.ts` sets `experimental.turbopackUseSystemTlsCerts` for the same reason (Google Fonts fetch at build time).

## Answer evaluation
- `evaluateAnswer(input, expected)` returns 'correct' | 'approximate' | 'incorrect'
- Levenshtein distance ≤ 2 = approximate (not wrong)
- For verbs: each form (present/prétérit/supin) evaluated separately via `evaluateVerbForms`

Content scripts take the pair as their last argument (default `sv-fr`):
`build-examples.ts <tatoeba-dir> [pair]`, `apply-frequency.ts <xx_50k.txt> [pair]`,
`import-stories.ts <dir> [pair]`, `import-grammar.ts <dir> [pair]`.

Story and grammar sources live in `Desktop\pro\{english,dutch,spanish}-content\{stories,grammar}\`.
Slugs are globally unique across pairs, hence the `en-`/`nl-`/`es-` prefixes. Rerun `apply-frequency` and `build-examples`
after every vocabulary batch — they process the whole pair, not just the new rows.
Their inputs (`en_50k.txt`, `tatoeba\`) are downloads, not repo content.

## SM-2 quality scores
- 0 = incorrect (resets interval)
- 3 = approximate (partial credit, doesn't advance)
- 4 = correct (advances normally)
- Mastered = interval > 21 days
