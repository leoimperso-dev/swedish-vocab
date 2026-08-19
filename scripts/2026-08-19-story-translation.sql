-- A story stored only its `term`-language body: comprehension came from tapping
-- words one at a time. That is enough for a written-for-learners story and not
-- enough for real-world prose, where a paragraph can be understood word by word
-- and still mean nothing. Bilingual sources carry their own translation, so
-- keep it.
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "bodyTranslated" TEXT;
