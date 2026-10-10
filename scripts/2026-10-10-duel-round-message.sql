-- A short note left with a round, shown to the opponent before they play
-- theirs and kept on the duel page afterwards. Nullable: most rounds carry
-- none, and an empty note is stored as NULL rather than an empty string.
ALTER TABLE "DuelRound"
  ADD COLUMN IF NOT EXISTS "message" TEXT;
