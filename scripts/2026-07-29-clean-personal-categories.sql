-- Swedish.txt has no real section categories; parser picked up note lines as titles
UPDATE "Word" SET "category" = NULL WHERE "source" = 'Swedish.txt' AND "category" IS NOT NULL;
