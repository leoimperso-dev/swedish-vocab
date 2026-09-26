-- Daily study reminder: whether it is wanted, and at what local hour.
-- Defaults on at 21:00 — a reminder nobody asked for is the point of a
-- reminder, and the switch is one tap away in the profile.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "reminderEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "reminderHour" INTEGER NOT NULL DEFAULT 21;
