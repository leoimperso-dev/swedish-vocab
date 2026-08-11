-- XP numbers were inflated (10 per correct answer, levels up to 15000).
-- Everything divides by ten — rewards in code, and here the stored state, so
-- relative progression is untouched and only the displayed numbers shrink.

UPDATE "User" SET
  "xp" = ROUND("xp" / 10.0),
  "dailyGoalXp" = GREATEST(1, ROUND("dailyGoalXp" / 10.0));

-- Levels derive from XP: recompute against the new thresholds
UPDATE "User" SET "level" = CASE
  WHEN "xp" >= 1500 THEN 7
  WHEN "xp" >= 700  THEN 6
  WHEN "xp" >= 350  THEN 5
  WHEN "xp" >= 150  THEN 4
  WHEN "xp" >= 60   THEN 3
  WHEN "xp" >= 20   THEN 2
  ELSE 1
END;

-- Historical session gains feed the stats charts — keep them on the same scale
UPDATE "StudySession" SET "xpGained" = ROUND("xpGained" / 10.0);

-- Achievement rewards (seed only inserts, it never updates existing rows)
UPDATE "Achievement" SET "xpReward" = GREATEST(1, ROUND("xpReward" / 10.0));

ALTER TABLE "User" ALTER COLUMN "dailyGoalXp" SET DEFAULT 3;
