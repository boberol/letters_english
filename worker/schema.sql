-- PlayGoo licence database (Cloudflare D1).
--
-- Apply with:
--   npx wrangler d1 execute nauka-liter-licences --local  --file=./schema.sql
--   npx wrangler d1 execute nauka-liter-licences --remote --file=./schema.sql
--
-- This creates a database from nothing. A database created before a column was
-- added needs the matching migrate-*.sql file instead: CREATE TABLE IF NOT
-- EXISTS leaves an existing table exactly as it was.

-- One row per sellable code.
--
-- `hash` is sha256 of the canonical code and is all that is stored: a dump of
-- this table is not a sheet of working codes. `cid` is the first 12 hex
-- characters of that hash - a short public reference for the token and for
-- support, so nobody has to paste a live code into a chat window. It is UNIQUE
-- so a collision fails at insert rather than quietly making two codes look like
-- one; at 48 bits that will not happen, but a batch script should not be the
-- thing that finds out.
CREATE TABLE IF NOT EXISTS codes (
  hash          TEXT PRIMARY KEY,
  cid           TEXT NOT NULL UNIQUE,
  batch         TEXT,
  device_limit  INTEGER NOT NULL DEFAULT 2,
  disabled      INTEGER NOT NULL DEFAULT 0,
  -- A fixed end date set at minting, for review copies and handouts. NULL for
  -- none. Checked against the device clock once the tablet is offline.
  expires_at    INTEGER,
  -- How long a licence runs, in days counted from first_used_at. NULL means
  -- perpetual. If expires_at is also set, whichever ends first wins.
  valid_days    INTEGER DEFAULT 365,
  -- The code's first successful activation on any device. Set once and never
  -- cleared - a support reset frees device slots but does not restart the year.
  first_used_at INTEGER,
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_codes_batch ON codes(batch);

-- One row per device that has redeemed a code. The primary key is what makes a
-- repeat activation from the same tablet idempotent instead of spending a
-- second slot.
CREATE TABLE IF NOT EXISTS activations (
  code_hash    TEXT NOT NULL,
  device_id    TEXT NOT NULL,
  activated_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (code_hash, device_id)
);

-- The device limit is enforced by counting rows for one code_hash inside the
-- same statement that inserts, so this index is on the hot path.
CREATE INDEX IF NOT EXISTS idx_activations_code ON activations(code_hash);

-- Failed attempts per IP per window. Swept by the Worker's cron trigger.
CREATE TABLE IF NOT EXISTS throttle (
  bucket     TEXT PRIMARY KEY,
  hits       INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_throttle_expiry ON throttle(expires_at);
