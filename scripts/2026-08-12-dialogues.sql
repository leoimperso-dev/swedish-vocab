-- Turn-by-turn conversations for the speaking exercise
CREATE TABLE IF NOT EXISTS "Dialogue" (
  "id" TEXT NOT NULL,
  "pair" TEXT NOT NULL DEFAULT 'sv-fr',
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "titleTranslated" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "turns" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Dialogue_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Dialogue_slug_key" ON "Dialogue"("slug");
CREATE INDEX IF NOT EXISTS "Dialogue_pair_level_idx" ON "Dialogue"("pair", "level");
