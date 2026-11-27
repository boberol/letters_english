-- Migration 001: licences run for a year from a code's first activation.
--
-- For a database created before this change. Apply ONCE, before deploying the
-- Worker that reads these columns:
--   npx wrangler d1 execute nauka-liter-licences --remote --file=./migrate-001-licence-duration.sql
--
-- Running it a second time stops at the first ALTER with "duplicate column
-- name", which changes nothing. A database created from the current schema.sql
-- already has both columns and does not need it.

-- Every code that exists today, sold or not, becomes a one-year code. The
-- default fills existing rows as well as new ones.
ALTER TABLE codes ADD COLUMN valid_days INTEGER DEFAULT 365;

ALTER TABLE codes ADD COLUMN first_used_at INTEGER;

-- A code that has already been activated started its year then, not now.
-- Without this, the first code to be used again after the migration would get
-- a fresh year from that moment.
UPDATE codes
SET first_used_at = (
  SELECT MIN(activated_at) FROM activations WHERE activations.code_hash = codes.hash
)
WHERE first_used_at IS NULL;
