-- Multi-language support: content is now scoped to a language pair, and a user's
-- course is (nativeLanguage, learningLanguage). See lib/courses.ts.
-- Existing rows are all Swedish/French, which the 'sv-fr' default already tags.

-- Word: pair + neutral column names
ALTER TABLE "Word" ADD COLUMN IF NOT EXISTS "pair" TEXT NOT NULL DEFAULT 'sv-fr';

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'Word' AND column_name = 'swedish') THEN
    ALTER TABLE "Word" RENAME COLUMN "swedish" TO "term";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'Word' AND column_name = 'french') THEN
    ALTER TABLE "Word" RENAME COLUMN "french" TO "translation";
  END IF;
END $$;

-- Same headword can exist in two languages ("man" is both Swedish and English),
-- so the uniqueness check has to include the pair.
DROP INDEX IF EXISTS "Word_swedish_wordType_source_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Word_pair_term_wordType_source_key"
  ON "Word"("pair", "term", "wordType", "source");

-- New-word selection always filters by pair before ordering on rank
DROP INDEX IF EXISTS "Word_frequencyRank_idx";
CREATE INDEX IF NOT EXISTS "Word_pair_frequencyRank_idx" ON "Word"("pair", "frequencyRank");

-- Story
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "pair" TEXT NOT NULL DEFAULT 'sv-fr';

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'Story' AND column_name = 'titleFrench') THEN
    ALTER TABLE "Story" RENAME COLUMN "titleFrench" TO "titleTranslated";
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Story_pair_idx" ON "Story"("pair");

-- GrammarLesson
ALTER TABLE "GrammarLesson" ADD COLUMN IF NOT EXISTS "pair" TEXT NOT NULL DEFAULT 'sv-fr';
CREATE INDEX IF NOT EXISTS "GrammarLesson_pair_order_idx" ON "GrammarLesson"("pair", "order");

-- User: the language being learned is no longer implied by nativeLanguage.
-- The 'sv' default already fits French speakers; only Swedish natives need a backfill.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "learningLanguage" TEXT NOT NULL DEFAULT 'sv';
UPDATE "User" SET "learningLanguage" = 'fr'
  WHERE "nativeLanguage" = 'sv' AND "learningLanguage" = 'sv';
