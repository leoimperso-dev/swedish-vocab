-- Real-world frequency rank (OpenSubtitles corpus), used to order new-word introduction
ALTER TABLE "Word" ADD COLUMN IF NOT EXISTS "frequencyRank" INTEGER;
CREATE INDEX IF NOT EXISTS "Word_frequencyRank_idx" ON "Word"("frequencyRank");
