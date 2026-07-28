-- Remove duplicate words (keep lowest id), then enforce uniqueness per source
DELETE FROM "Word" a USING "Word" b
WHERE a.id > b.id
  AND a.swedish = b.swedish
  AND a."wordType" = b."wordType"
  AND a.source IS NOT DISTINCT FROM b.source;

CREATE UNIQUE INDEX "Word_swedish_wordType_source_key"
  ON "Word"("swedish", "wordType", "source");
