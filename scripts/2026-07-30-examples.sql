-- Real example sentences from Tatoeba (CC-BY): [{sv, fr?, blank}]
ALTER TABLE "Word" ADD COLUMN IF NOT EXISTS "examples" JSONB;
