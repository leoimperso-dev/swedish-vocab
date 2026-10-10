-- Duel pushes (your turn, duel over) get their own switch.
-- Until now the only way to stop them was to drop the device subscription,
-- which also silenced the daily study reminder — and the card offering that
-- button was labelled "duel notifications", so the side effect was invisible.
-- On by default: that is the behaviour every account already had.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "duelNotifications" BOOLEAN NOT NULL DEFAULT true;
