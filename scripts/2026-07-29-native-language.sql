-- Bilingual mode: fr native (learns Swedish) or sv native (learns French)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "nativeLanguage" TEXT NOT NULL DEFAULT 'fr';
