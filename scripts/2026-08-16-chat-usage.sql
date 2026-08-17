-- Throttling state for the AI conversation partner.
--
-- Groq's free tier is bounded by tokens per minute, shared by everyone, so one
-- learner in a loop can starve the whole app. One row per learner per day holds
-- both guards: the daily volume and the time of the last turn. No transcript is
-- stored — the conversation lives in the browser for its duration.
CREATE TABLE IF NOT EXISTS "ChatUsage" (
  "id"            TEXT PRIMARY KEY,
  "userId"        TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "day"           TEXT NOT NULL,
  "messageCount"  INTEGER NOT NULL DEFAULT 0,
  "lastMessageAt" TIMESTAMP(3)
);

-- The reservation is an upsert on this key: O(1), no scan on the hot path
CREATE UNIQUE INDEX IF NOT EXISTS "ChatUsage_userId_day_key"
  ON "ChatUsage" ("userId", "day");
