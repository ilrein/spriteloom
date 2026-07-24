-- Model attribution: NULL = human (web UI), "unknown" = agent that didn't
-- declare itself, anything else = the declared model id. Foundation for
-- pixelbench (comparing models at pixel art).
ALTER TABLE "sprite" ADD COLUMN "model" TEXT;

-- backfill existing loombot generations (no-op on fresh databases)
UPDATE "sprite" SET "model" = '@cf/openai/gpt-oss-120b' WHERE "userId" = 'seed-user-loombot';
