-- Graded reading stories
CREATE TABLE IF NOT EXISTS "Story" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "titleFrench" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "wordCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Story_slug_key" ON "Story"("slug");
