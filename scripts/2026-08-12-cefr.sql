-- CEFR level per word (derived from frequencyRank, see lib/cefr.ts)
ALTER TABLE "Word" ADD COLUMN IF NOT EXISTS "cefr" TEXT;
CREATE INDEX IF NOT EXISTS "Word_pair_cefr_rank_idx"
  ON "Word"("pair", "cefr", "frequencyRank");

-- Self-declared level per learned language: { "sv": "A2", "en": "B2" }
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "levels" JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE "Word" SET "cefr" = CASE
  WHEN "frequencyRank" IS NULL OR "frequencyRank" <= 0 THEN 'C2'
  WHEN "frequencyRank" <=   600 THEN 'A1'
  WHEN "frequencyRank" <=  1200 THEN 'A2'
  WHEN "frequencyRank" <=  2500 THEN 'B1'
  WHEN "frequencyRank" <=  5000 THEN 'B2'
  WHEN "frequencyRank" <= 10000 THEN 'C1'
  ELSE 'C2'
END;
