-- The daily goal was sized before the XP rescale: 3 XP is a couple of answers,
-- not a day's work. Floor it at 15, roughly one full session.
ALTER TABLE "User" ALTER COLUMN "dailyGoalXp" SET DEFAULT 15;
UPDATE "User" SET "dailyGoalXp" = 15 WHERE "dailyGoalXp" < 15;
