-- Per-direction SM-2 progression (SV_FR = comprehension, FR_SV = production)
ALTER TABLE "UserWord" ADD COLUMN IF NOT EXISTS "direction" TEXT NOT NULL DEFAULT 'SV_FR';
DROP INDEX IF EXISTS "UserWord_userId_wordId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "UserWord_userId_wordId_direction_key" ON "UserWord"("userId", "wordId", "direction");
