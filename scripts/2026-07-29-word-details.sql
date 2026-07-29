-- Enrichment: { translations: string[], context?: string, usage?: [{sv, fr}] }
ALTER TABLE "Word" ADD COLUMN IF NOT EXISTS "details" JSONB;
