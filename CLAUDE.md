# Vocab App

Next.js app for learning vocabulary with spaced repetition. Swedish↔French,
English↔French, Dutch→French and Spanish→French today; see "Languages" below
before adding another.

## Stack
- Next.js 16 App Router, TypeScript, Tailwind CSS v4
- Auth: NextAuth v5 (beta) — Google OAuth + email/password (see "Auth")
- DB: PostgreSQL via Supabase + Prisma ORM (**pinned to v6** — v7 dropped `url` in schema datasource and requires driver adapters; do not upgrade without migrating the config)
- Animations: Framer Motion (exercises) + CSS keyframes (`animate-rise/pop/shake`)

## Design system
Dark-only, mobile-first (max-w-[430px]), ported from the svensk-spark Lovable design.
- Tokens: oklch semantic vars in `app/globals.css` (`@theme inline`) — use `bg-surface`, `text-muted-foreground`, `text-success/warning/danger/streak/freeze/info/accent`, `*-soft` backgrounds; never raw palette classes (slate-*, blue-*)
- Utilities: `card-surface`, `pressable` (cursor + active scale), `text-hero-word`, `bg-gradient-nordic`, `bg-gradient-xp`, `safe-top/bottom`
- Fonts: Inter (`font-sans`) + Space Grotesk (`font-display` — headings, big numbers) via next/font
- Primitives: `components/ui/` (Card, Chip, ProgressBar, Segmented, TextField, Button + `buttonClasses()` for Links — no cva/radix)
- `components/FavoritesProvider.tsx`: the starred-word set, seeded by the (app) layout. A word
  is starred from the vocabulary list, the session header and the story word popover, so the
  set lives above all three — `/api/words` deliberately does not carry it (that list is cached
  in sessionStorage). Star with `<FavoriteStar wordId label />`.
- `components/AppShell.tsx`: sticky page header (title + `CoursePicker` + streak/freeze/XP chips fed by `StatsProvider` from the (app) layout). Used by all pages except session/login/results.
- `components/ui/flags.tsx`: `<Flag lang>` SVG marks. Text-only contexts (Segmented labels) use `flagOf()` emoji instead.
- Icons: lucide-react (no emojis in UI chrome; emojis stay in content data)

## Key files
- `lib/sm2.ts` — SM-2 spaced repetition algorithm
- `lib/study/build.ts` — draws a player's exercises (due words ranked by level, topped up with
  new ones) and their QCM distractors / accepted alternatives. Shared by the solo session and
  a duel round, which is why neither route holds that logic. A MIX session deals its types from
  `SOLO_MIX` quotas, the easiest slots going to the least-known words: chosen per word, the
  type followed that word's own progression, so a beginner — whose list is nearly all new words
  — got a flashcard every single time and MIX drilled one type.
- `lib/study/answer.ts` / `lib/study/finalize.ts` — one answer (SM-2 + session counters) and
  the end of a session (XP, streak, achievements, daily goal), both reused by duels
- `lib/fuzzy.ts` — Levenshtein fuzzy matching for answer evaluation
- `lib/xp.ts` — XP calculation, level system, daily-goal bounds (floor 15 XP ≈ one session)
- `lib/tts.ts` — speech synthesis; picks the best-scoring voice for a locale unless the
  learner chose one in the profile (voice and rate live per device in localStorage, not on
  the account). English is listed natural-voices-only (`NATURAL_ONLY_LANGS`) — desktops ship
  a dozen legacy SAPI voices for it that bury the good ones; the profile has a checkbox to
  see every installed voice anyway. `speakSequence` + `learnedSpeech()` read a headword
  followed by its comparative and superlative — hearing only the base teaches half an adjective.
- `lib/streak.ts` — Daily streak logic (timezone-aware) + streak freezes (max 2, absorb missed days, +1 earned per 7-day milestone)
- `lib/achievements.ts` — Achievement definitions and unlock checks
- `lib/courses.ts` — Language registry: pairs, courses, directions, locales, verb forms
- `lib/morphology.ts` — Surface form → headword rules, per learned language. Derivational
  suffixes (`-heid`, `-ing`, `-het`, `-ning`…) resolve to their base **and** are barred from
  being a compound head: splitting "kortademigheid" as "kortademig" + "heid" once answered
  "un païen". A derived word points at its base, never at its suffix.
- `auth.ts` — NextAuth config (Google + Credentials providers, PrismaAdapter)
- `scripts/parse-vocabulary.ts` — Parser for the vocabulary files of every pair
- `scripts/merge-core.ts` — Merges agent-generated vocab chunks into a core file (dedup by headword)

## Auth
Two ways in, both landing on the same account: Google, and email/password
(NextAuth's `Credentials` provider). Screens live in `app/(auth)/` — login,
signup, forgot-password, reset-password — over `components/auth/`.

- **An email is one learner.** The hash sits on `User.passwordHash`, not in an
  `Account` row (Credentials has no adapter account), and Google carries
  `allowDangerousEmailAccountLinking` so signing in the other way joins the
  existing account rather than forking its progression. Safe because Google
  verifies the address. `/api/register` follows the same rule: an address that
  only had Google gains a password instead of a second account.
- **No email confirmation** — signup signs you straight in. The address is only
  used for the reset link, so an unverified one costs nothing.
- **Reset** (`PasswordResetToken`, `lib/auth/reset-token.ts`): the emailed token
  is random 32 bytes, the row stores only its SHA-256, it lasts an hour, and
  asking again voids the pending one. `/api/password/forgot` always answers ok,
  registered address or not — the response must not enumerate accounts.
- **Email** goes through Brevo's SMTP relay (`lib/email.ts`, nodemailer on 587 +
  STARTTLS), the same provider Carnet de champs sends from. `EMAIL_FROM` must be
  a sender verified in Brevo. With no `BREVO_SMTP_KEY` the reset link is logged
  to the server console instead, so the flow stays testable locally. Check the
  relay with `pnpm tsx --env-file=.env.local scripts/try-email.ts <address>`.
  nodemailer is **pinned to v8** — v9 breaks next-auth's peer range.
- A Google-only account has no hash and is unreachable by password until its
  owner sets one through the reset flow.
- `middleware.ts` lists the routes reachable without a session — a new auth page
  or endpoint must be added to `PUBLIC_PAGES` / `PUBLIC_APIS`.

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

The picker also offers `MIXED` (`DirectionChoice`): the session reviews **both schedules at once**
and each card is asked — and credited — in the direction it is actually due in (a word due both
ways is kept once). A never-seen word gets a random one. Nothing is flipped after drawing, which
would advance a schedule that was not due; the client posts `ExerciseWord.direction`, not the
picker's value.

`exerciseDirection()` overrides both of those for **dictation, cloze and conjugation**: their
answer *is* the learned language, so they always carry the `native → learned` direction whatever
the card was scheduled as. Left on a `learned → native` card, the learner typed English while the
French schedule advanced. The card simply stays due. Guarded by `scripts/check-speech-language.ts`
(step 3) and `scripts/check-mixed-session.ts`.

## Expressions
The curated lists carry an `EXPRESSIONS` category (set phrases and idioms). The study picker has
a mode of its own for them (`?scope=expressions` → `BuildOptions.category`): an idiom is learned
as a block, and mixed among ordinary headwords it never comes up often enough to stick.
**`sv-fr` has no such category yet** — the mode is empty for Swedish learners until the list gets
one. Counts today: nl 101, es 100, en 49, sv 0.

## Content tied to the `term` side
Verb forms, Tatoeba sentences, stories and grammar lessons are authored for the pair's `term`
language and written in its `translation` language. `learnsTermLanguage(course)` gates conjugation,
cloze, reading and grammar — a Swedish native learning French gets vocabulary exercises only.
`Word.details` (JSONB `{translations[], context?, usage[{term,translation}]}`) follows the same rule
via `showsEnrichedAnswer()`.

**Whatever is spoken must be in the language being learned, and read by a voice of it.** That is
not automatic: `Word.term`, `Word.examples`, stories, dialogues and grammar are all authored in
the pair's `term` language, so on an inverted course (`sv → fr`, `en → fr`) they are the
learner's *native* language. Reading them with `localeOf(course.learned)` said Swedish words in a
French voice and never one French word. Hence `learnedSpeech()` for words, the example gate in
`ListeningExercise`, the side swap in the vocabulary list's read-aloud, and a **server-side**
guard on `/reading`, `/grammar` and the dialogue pages — hiding their links left the URL open.
The free chat is generated in the learned language, so it stays open to every course.
Guarded by `scripts/check-speech-language.ts`.

## CEFR levels
Every user declares a level per learned language (`User.levels`, a JSON map
`{ "sv": "A2" }`). `Word.cefr` is derived from `frequencyRank` by `lib/cefr.ts`
(A1 ≤ 600, A2 ≤ 1200, B1 ≤ 2500, B2 ≤ 5000, C1 ≤ 10000, C2 beyond / unranked).

The level is a **floor on new words**, and a **priority on reviews**. New words are
drawn from that band and above, falling back to the whole pair if the band runs dry (measured:
it never does — every band holds 9-11k unstudied words). Due words are drawn from a wide pool
and ranked by `reviewPriority()`: at-or-above level first, then under-level words the learner
still gets wrong, then the rest. Without that ranking a B2 learner spent two thirds of every
session on "du", "att", "och" — started long ago and rescheduled forever, since only 5 of 15
cards are new. Guarded by `scripts/check-review-priority.ts`; diagnose with
`scripts/audit-levels.ts`.

`scripts/assign-cefr.ts` recomputes the column — run it after `apply-frequency`. It scores a
multi-word expression by its hardest component, **resolving inflections through
`lemmaCandidates()`**: without that, "neem me niet kwalijk" failed on "neem" (imperative of
"nemen") and fell to C2, hiding an A1 courtesy phrase. A phrase must never inherit a rank from
its first word either — `scripts/fix-phrase-ranks.ts` clears those, then rerun assign-cefr.

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

## Free conversation (AI)
`/conversation/chat` — an open conversation with a Groq-backed partner, next to the scripted
`Dialogue` list. Available to **every** course, unlike reading/grammar/dialogues: it is generated,
not authored for the pair's `term` side.

- `lib/chat/prompt.ts` — system prompt (level-aware) and `splitCorrection()`. The model ends with an
  optional `⟦fix⟧` line; the split holds back any tail that could still grow into the marker, so a
  correction never flashes as reply text mid-stream. Guarded by `scripts/check-chat-prompt.ts`.
- `lib/chat/models.ts` — providers, chain and token budget. `CHAT_CHAIN` spans **several providers**
  so an outage or an exhausted budget does not take the chat down: Groq's `llama-3.3-70b`, then the
  *same model* on Cloudflare Workers AI (free, ~200 turns/day in the daily neuron allocation), and only
  after both a weaker model. A provider with no key — or, for Cloudflare, no account id — is
  silently skipped, so every rung past the first is optional. Providers are reached through the
  **`openai` client, never a vendor SDK**: `groq-sdk` hardcodes `/openai/v1/chat/completions`, so
  re-pointing its baseURL 404s instead of calling.
  OpenRouter's free models were measured and rejected as a rung: `gemma-4-31b:free` failed 8/8 with
  "rate-limited upstream", `glm-5.2:free` answered 3/8 at 27s a call. Cloudflare's fp8 quantisation
  costs nothing in quality — it also scores 8/8, at 1.3s a call against Groq's 0.25s.
  `pnpm tsx scripts/bench-chat-models.ts` scores models on real mistakes across four languages and
  is what settled the order: llama-3.3-70b 8/8, llama-3.1-8b 7/8, gpt-oss 3/8 (never corrects),
  qwen3.6 1/8 and leaks its own reasoning into the reply. Detection is ~7/8 runs at TEMPERATURE 0.4;
  an *invented* correction never occurred, so the residual error is benign. Topics use `TOPICS_MODEL`.
- `lib/chat/stream.ts` — fallback across models. Groq raises 429 from `create()` before any chunk,
  so the whole chain resolves before a 200 is returned and errors can still be JSON. Always passes
  `{ maxRetries: 0, timeout }` — the SDK's defaults (2 retries, 60s) would eat the function budget.
- `lib/chat/usage.ts` — `ChatUsage(userId, day)`: daily cap and a 4s minimum between turns, one
  upsert, no scan. Refunded when every model was saturated.
- `lib/chat/diff.ts` — word-level diff between what the learner wrote and the corrected sentence,
  computed client-side so the changed words can be highlighted. Free, and the model cannot mis-mark
  what it never marks.
- No transcript is stored. The entry card is hidden unless `GROQ_API_KEY` is set.
- `pnpm tsx scripts/try-chat.ts [lang] ["phrase"]` sends one real turn, to check the key end to end.

## Duels
Asynchronous matches between two learners of the same **pair**, under `/duels` (the nav's
trophy slot; `CompeteTabs` switches between duels and the leaderboard, so the bar keeps six
entries). Nobody plays at the same time: the challenger opens a round, the turn passes, the
opponent answers the *same round number* on **their own words**, drawn at their own CEFR
level. The higher score takes the round, a tie gives nobody the point, and the match ends on
a majority (`winsNeeded`) or on the last round.

- `lib/duel/rules.ts` — sizes, the two game modes and `scoreAnswer`. **CLASSIC**: 10 / 5 / 0
  with a `+2` bonus once three correct answers are chained. **BLITZ**: `BLITZ_SECONDS` per
  exercise, up to `+6` for answering fast; a timeout is scored as wrong. Guarded by
  `scripts/check-duel-rules.ts`.
- `lib/duel/service.ts` — the state machine (`submitRound`, `pendingDuelCount`, `listDuels`).
  Guarded end-to-end against the real DB by `scripts/simulate-duel.ts`, which plays a full
  best-of-3 with two throwaway accounts and deletes them.
- **A round is a normal `StudySession`.** Answers go through `lib/study/answer.ts` (SM-2) and
  the round closes with `lib/study/finalize.ts` (XP, streak, achievements, daily goal), so a
  duel rewards exactly what the same ten exercises would alone, plus `DUEL_XP`. That is why
  the solo session route and the duel route share `lib/study/build.ts` rather than each
  drawing their own words.
- **A round is built with `policy: 'DUEL'`** (`lib/study/build.ts`), which differs from a solo
  session in three ways, all aimed at making a round *decide* something:
  - no flashcard — nothing self-assessed can carry a score;
  - words already met come first (due, then studied-but-not-due, weakest recall first), and
    unseen words only fill what is left. A learner with no history still gets a full round;
  - exercise types are dealt from the `ROUND_MIX` quotas (4 typing, 3 dictation, 3 QCM, with
    up to `ROUND_VARIANT_SLOTS` typing slots becoming cloze/conjugation) instead of being
    chosen per word — see `lib/duel/mix.ts`. Left to the solo picker a round drifted to
    near-pure QCM, which both players aced, and every match ended in a draw.
- **Blitz flips the direction per exercise** (`flipDirections`), on **multiple choice only** —
  picking a translation out of four options is a fair drill either way round, writing one is
  not. Each exercise then carries its own
  `ExerciseWord.direction`, which the browser reports back per answer so SM-2 credits the
  right progression; the server only accepts a direction belonging to that player's course.
- **The blitz clock is per exercise type** (`BLITZ_SECONDS`, `blitzSeconds()`): 8s for a QCM,
  40s for a dictation. One budget for the whole round made dictation and cloze unplayable —
  the time is set by what the *task* takes. The deadline is deliberately generous and the
  **speed bonus is measured against half of it** (`BLITZ_PAR_RATIO`), because a bonus spread
  over a long clock puts every honest answer near the maximum and stops ranking anyone. Both
  are relative to the exercise's own budget, so the same share of any clock pays the same —
  hence the answer reports its `exerciseType` alongside `msLeft`.
- **The clock stops when the answer is given**, not when the learner moves on. Graded exercises
  fire `onSubmitted(result)` the instant they evaluate — before the correction is shown and
  before the word is spoken in full — and the duel page freezes its timer there, banks the
  points and flashes `+X`. Without it, waiting for the readout drained the speed bonus, and a
  slow one could expire an exercise that had just been answered correctly.
- The score is **recomputed server-side** from the results the browser reports — the client
  only says what was answered and how much clock was left.
- A round's score stays hidden until both sides have played it, so nobody plays knowing the
  number to beat.

### Champion of the week & public profiles
`WeeklyWin` records who earned the most XP in a finished week, one row per winner (ties all
win — the key is `[weekStart, userId]`). `lib/weekly.ts` closes a week **lazily**, on the first
read of the leaderboard after it ends, and catches up to `MAX_WEEKS_BEHIND` weeks at once, so
there is no cron to keep alive. A closed week is never recomputed: a title cannot be taken back
by a later change to the ranking. Everyone is ranked on the same week in `CONTEST_TIMEZONE` —
the running week used to start on each viewer's own Monday, which gave players in different
countries different deadlines.

`/profile/[id]` is the public profile, reachable from the leaderboard and the duel list: XP,
streak, weeks won, duel record and last seen. `lib/profile-stats.ts` computes it.
**`xpByLanguage()` is an estimate and the UI says so** — XP is stored globally on the user and
a `StudySession` does not record which language it drilled, so the split is inferred from how
the learner's vocabulary is spread across pairs. `User.lastSeenAt` is written by the (app)
layout, at most once per `LAST_SEEN_THROTTLE_MS`.

### Notifications
Two layers. The badge on the nav is fed by `pendingDuelCount` through the (app) layout and
`StatsProvider`, and always works. Web Push (`lib/push.ts`, `PushSubscription`, the `push` /
`notificationclick` handlers in `public/sw.js`, opt-in per device from the profile) is
**entirely optional**: with no VAPID keys `pushEnabled` is false, the profile card is hidden
and `notify()` is a no-op. Notifications are written in the *recipient's* interface language.

**iOS only delivers Web Push to an app launched from the home screen** — in a Safari tab the
API is absent, so `PushToggle` detects that case (`needsHomeScreenInstall`) and tells the user
to install rather than claiming the device is unsupported. That is what the `appleWebApp`
metadata and the `icons.apple` entry in `app/layout.tsx` are for; iOS ignores the manifest
icons for the home screen and would otherwise use a screenshot of the page. Requesting the
permission must stay inside a real tap (the button), which Apple enforces.

## Reading
`Story` table (48 graded stories, 4 levels) under `/reading`; `StoryReader` makes every word
tappable → `/api/dictionary?q=` backed by `lib/dictionary.ts` (one in-memory map per pair, over
headwords + stored forms, falling back to `lemmaCandidates()` from `lib/morphology.ts`).

## Bilingual stories
`Story.body` holds the `term`-language text; `bodyTranslated` holds the same paragraphs in the
`translation` language, and is **null on the generated stories** — those are written for learners
and the word popover carries them. Real-world prose is different: a paragraph can be understood
word by word and still mean nothing, so a source that comes with its own translation keeps it.
The reader hides it behind a per-paragraph « Voir la traduction », because reading it first is
reading French. Import with `scripts/add-story.ts <term.txt> <translation.txt> <slug> "<titre>"
"<titre traduit>" [pair] [level]` — it refuses a mismatched paragraph count, since the alignment
is the whole point.

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
(`don` from "don't" at rank 31).

Their glosses were reviewed language by language and rewritten to the primary sense
(`bay` was "crier, aboyer", now "une baie"), because the app asks in both directions
and a one-way gloss makes an unanswerable card. **`mark-studyable.ts` does not know
about that review**: re-running it restores entries the review dropped, so follow it
with `scripts/import-wiki-glosses.ts <dir> --apply` (sources in
`Desktop\pro\wiki-glosses\`).

Adjective degrees were filled the same way, per language, with `export-adjective-forms.ts`
→ review → `import-adjective-forms.ts <dir> --apply` (sources in `Desktop\pro\adjective-degrees\`).
A non-gradable adjective (`dead`, `getrouwd`, `inre`, ordinals, nationalities) keeps no degree —
an invented one is worse than none. Spanish is deliberately absent: only its four suppletive
adjectives are stored, the rest builds with `más`. `scripts/audit-forms.ts` reports coverage.

Dutch nouns carry their `de`/`het` article — it is part of the word. The French dump states
the gender for barely half of them, so the generator falls back to the `nl-noun` head template
of the **English** dump (`kaikki-nl-en.jsonl`), which covers almost the rest;
`scripts/fix-dutch-articles.ts <kaikki-nl-en.jsonl> [--apply]` backfills already-seeded rows
the same way (2 261 fixed), with suffix rules (`-ment`, `-heid`, `-ing`…, each measured above
96% against the dump) for what the dump misses. Months and weekdays stay bare on both sides.

Glosses are cross-checked against WikDict (CC BY-SA, built from Wiktionary/DBnary,
`Desktop\pro\wikdict\<pair>.sqlite3`) with `scripts/cross-check-glosses.ts`. WikDict is a
second opinion, never a source of truth — it says `bueno → allo`. A disagreement is a review
request; most turn out to be synonyms. `scripts/audit-glosses.ts` catches malformed glosses,
`scripts/audit-duplicates.ts` the same word served as two cards, and `scripts/dedupe-words.ts`
merges them (the ranked row survives and adopts the best gloss of the group).

Tatoeba is a general-purpose corpus and carries sentences unfit for a learning app;
`scripts/filter-examples.ts --apply` strips them, with blocklists per language. After each vocabulary batch, re-run `apply-frequency`
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

## Error reports
`ErrorReport` collects what learners flag as wrong, from the session header (every exercise
type, via `SessionProgress`) and the story word popover. `<ReportButton wordId context
shownTerm shownTranslation />` posts to `/api/report`; the shown text is copied into the row so
the report stays readable after the entry is fixed. Triage with
`pnpm tsx scripts/list-reports.ts` (`--all`, `--resolve <id>`). This is the only detector for a
gloss that is wrong but well formed — no audit script can see those.

## Commands
```
pnpm dev                      # dev server
pnpm db:apply <file.sql>      # apply SQL to Supabase via node-postgres
pnpm db:seed                  # parse .txt files and seed DB
pnpm parse                    # test vocabulary parser
pnpm tsx scripts/check-story-coverage.ts   # QA: every story token must resolve
pnpm tsx scripts/mark-studyable.ts         # recompute Word.studyable (after each seed)
pnpm tsx scripts/assign-cefr.ts            # recompute Word.cefr (after apply-frequency)
pnpm tsx scripts/check-duel-rules.ts       # QA: duel scoring and match resolution
pnpm tsx scripts/check-speech-language.ts  # QA: every course only ever speaks the learned language
pnpm tsx scripts/simulate-duel.ts          # QA: full duel against the DB (self-cleaning)
pnpm tsx scripts/check-mixed-session.ts <email>  # QA: a MIXED session keeps each card's direction
pnpm tsx scripts/check-mastered.ts         # QA: "I know these perfectly" (throwaway account)
pnpm tsx scripts/check-password-auth.ts    # QA: hashing + reset tokens (throwaway account)
pnpm tsx --env-file=.env.local scripts/try-email.ts <address>  # sends one real email through Brevo
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
- Both sides expand to their acceptable spellings first: with and without the leading
  article or infinitive particle ("un monstre" / "monster"), without usage notes, and one
  sense at a time ("crier, aboyer" is answered by either). Entries are inconsistent about
  articles across languages, so this is what makes them interchangeable — not the data.
  `pnpm tsx scripts/check-answer-matching.ts` guards the rules.
- **Punctuation is never graded** — it is stripped from both sides before comparing. Losing a
  dictation over a missing full stop or a curly apostrophe made the exercise unwinnable.
- An expected answer of 4+ words is a **dictated sentence** and is graded word by word
  (`evaluateSentence`), not by character distance: one wrong word in the middle used to blow the
  whole character budget. **Capitalised words are free** — a name cannot be spelled from hearing
  it. That includes the sentence's first word, since many open on a name; the trade-off is that
  the opening word goes ungraded.
- Otherwise Levenshtein against the closest acceptable spelling = approximate (not wrong),
  tolerating 1 slip up to 4 characters, 2 up to 8, 3 beyond
- For verbs: each form (present/prétérit/supin) evaluated separately via `evaluateVerbForms`

Example sentences come from Tatoeba, which pairs sentences by hand — a large share arrives with
no French counterpart (41% of the Swedish ones). `scripts/translate-examples.ts <pair>` fills
**only** the empty ones with DeepL (`DEEPL_API_KEY`, `--dry` to preview); an existing translation
is never touched, however literal it looks, because those are human. A sentence met in the wild
goes in with `scripts/add-example.ts <term> "<phrase>" "<traduction>" [pair]`, which marks it
`manual: true` — `build-examples.ts` rewrites a word's whole array, and keeps those.
A whole bilingual document is mined by `scripts/harvest-examples.ts <term.txt> <translation.txt>
[pair] [--dry]`: it attaches each sentence to the **rare** words in it (corpus rank ≥ 4000, fewer
than 3 translated examples), rarest first. Unranked words are deliberately not treated as rare —
most are unranked because the corpus never saw that spelling ("inte", "som"), and regulations
hung off them teach nobody anything. Homographs go through the same `resolveKeyOwnership` as
`build-examples.ts`, over **every** word of the pair and not only the rare ones: filtering first
would let a rare homograph win a key by default because its frequent rival was already gone
("visa" the song inheriting a sentence about *visa*, to show).

A word met while reading and absent from the dictionary is not a gap but a wrong answer — the
word popover falls back to half a compound, or to a homograph. Add it with
`scripts/add-word.ts <term> <translation> [pair] [wordType] [category]`, or `--file words.json`
for a batch. New entries land unranked, so `cefrForRank(null)` makes them C2 and they stay out of
a beginner's new-word draw until `apply-frequency` runs again.

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

The vocabulary list can also declare words known outright: the ✓ button next to the read-aloud
one turns rows into checkboxes, and `/api/words/mastered` (`lib/words/mastered.ts`) writes
`MASTERED_STATE()` to the selection in **both directions** — `interval` clears the ladder's top
rung, `repetitions` clears the SM-2 warm-up so the next real review multiplies instead of
restarting. It awards **no XP** on purpose: a claim over hundreds of words would mint more in one
tap than a month of sessions. A wrong answer later still resets everything. Guarded by
`scripts/check-mastered.ts`.
