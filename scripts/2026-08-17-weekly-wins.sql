-- Weekly champion: who earned the most XP in a finished week, and how many
-- times each learner has done it. See lib/weekly.ts.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "WeeklyWin" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "weekStart" DATE NOT NULL,
  "xp"        INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WeeklyWin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WeeklyWin_weekStart_userId_key" ON "WeeklyWin" ("weekStart", "userId");
CREATE INDEX IF NOT EXISTS "WeeklyWin_userId_idx" ON "WeeklyWin" ("userId");

ALTER TABLE "WeeklyWin" DROP CONSTRAINT IF EXISTS "WeeklyWin_userId_fkey";
ALTER TABLE "WeeklyWin" ADD CONSTRAINT "WeeklyWin_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
