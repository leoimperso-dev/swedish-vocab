-- A session played offline is replayed on reconnection. The phone keeps the
-- answers until the server confirms, and a flaky connection can send the same
-- batch twice — so the batch carries an id of its own and the second attempt
-- finds the session already there instead of doubling the XP.
ALTER TABLE "StudySession" ADD COLUMN IF NOT EXISTS "offlineBatch" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "StudySession_userId_offlineBatch_key"
  ON "StudySession" ("userId", "offlineBatch") WHERE "offlineBatch" IS NOT NULL;
