-- Learner-submitted reports of a wrong card. The audits read the data; the
-- learner reads the card, and catches what no heuristic can.
CREATE TABLE IF NOT EXISTS "ErrorReport" (
  "id"               TEXT PRIMARY KEY,
  "userId"           TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  -- Nullable so a report outlives the entry it points at
  "wordId"           TEXT REFERENCES "Word"("id") ON DELETE SET NULL,
  "pair"             TEXT NOT NULL,
  "context"          TEXT,
  "shownTerm"        TEXT,
  "shownTranslation" TEXT,
  "message"          TEXT NOT NULL,
  "resolved"         BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- The triage query is "what is still open, newest first"
CREATE INDEX IF NOT EXISTS "ErrorReport_resolved_createdAt_idx"
  ON "ErrorReport" ("resolved", "createdAt");
