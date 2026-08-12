-- Not every dictionary entry makes a usable exercise. Two kinds are excluded
-- from study sessions while staying fully available to the dictionary, the
-- reader, the vocabulary list and search:
--
--   1. term == translation ("important" → "important"): a correct entry, but
--      there is nothing to recall.
--   2. the bulk Wiktionary batches: rare senses whose frequency rank is often
--      inherited from a frequent homograph absent from our data — "don" ranks
--      31st because the corpus tokenises "don't" as "don" + "t", so a literary
--      word for "enfiler" surfaced in the first sessions.
ALTER TABLE "Word" ADD COLUMN IF NOT EXISTS "studyable" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Word" SET "studyable" = NOT (
  source LIKE '%\_wiki.txt'
  OR lower(regexp_replace(term, '^(en|ett|att|to|de|het|el|la|los|las) ', '')) = lower(translation)
);

CREATE INDEX IF NOT EXISTS "Word_pair_studyable_rank_idx"
  ON "Word"("pair", "studyable", "frequencyRank");
