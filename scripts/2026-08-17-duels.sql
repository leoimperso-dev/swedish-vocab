-- Asynchronous duels between two learners + Web Push endpoints.

CREATE TABLE IF NOT EXISTS "Duel" (
  "id" TEXT NOT NULL,
  "pair" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'CLASSIC',
  "rounds" INTEGER NOT NULL DEFAULT 5,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "challengerId" TEXT NOT NULL,
  "opponentId" TEXT NOT NULL,
  "challengerWins" INTEGER NOT NULL DEFAULT 0,
  "opponentWins" INTEGER NOT NULL DEFAULT 0,
  "turnUserId" TEXT,
  "currentRound" INTEGER NOT NULL DEFAULT 1,
  "winnerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "Duel_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Duel_challengerId_status_idx" ON "Duel"("challengerId", "status");
CREATE INDEX IF NOT EXISTS "Duel_opponentId_status_idx" ON "Duel"("opponentId", "status");
CREATE INDEX IF NOT EXISTS "Duel_turnUserId_idx" ON "Duel"("turnUserId");

CREATE TABLE IF NOT EXISTS "DuelRound" (
  "id" TEXT NOT NULL,
  "duelId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "round" INTEGER NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 0,
  "correct" INTEGER NOT NULL DEFAULT 0,
  "approx" INTEGER NOT NULL DEFAULT 0,
  "wrong" INTEGER NOT NULL DEFAULT 0,
  "sessionId" TEXT,
  "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DuelRound_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DuelRound_duelId_userId_round_key" ON "DuelRound"("duelId", "userId", "round");
CREATE INDEX IF NOT EXISTS "DuelRound_duelId_round_idx" ON "DuelRound"("duelId", "round");

CREATE TABLE IF NOT EXISTS "PushSubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId");

DO $$ BEGIN
  ALTER TABLE "Duel" ADD CONSTRAINT "Duel_challengerId_fkey"
    FOREIGN KEY ("challengerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Duel" ADD CONSTRAINT "Duel_opponentId_fkey"
    FOREIGN KEY ("opponentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DuelRound" ADD CONSTRAINT "DuelRound_duelId_fkey"
    FOREIGN KEY ("duelId") REFERENCES "Duel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DuelRound" ADD CONSTRAINT "DuelRound_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
