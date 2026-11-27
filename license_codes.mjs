// Mint a batch of activation codes and register them with the licence Worker.
//
//   node license_codes.mjs --count 50 --batch "2026-01-sklep"
//   node license_codes.mjs --count 10 --batch "recenzenci" --limit 3 --days 30
//   node license_codes.mjs --count 5  --batch "partnerzy" --perpetual
//   node license_codes.mjs --count 50 --batch "2026-01-sklep" --dry-run
//
// Each code's licence runs for --days (365 unless told otherwise) counted from
// its first activation on any device - not from today, so a code can wait in a
// drawer without losing time. --perpetual makes codes that never run out.
// --expires 2027-01-01 adds a fixed end date on top; whichever comes first wins.
//
// The codes themselves never leave this machine. What goes to the server is the
// sha256 of each one, so the database holds no sellable code and a dump of it is
// worth nothing. The CSV this writes is therefore the only copy - if you lose it
// before handing the codes out, those codes are gone and you mint a new batch.
//
// Needs, in the environment:
//   LICENSE_ADMIN_URL    https://nauka-liter-licence.<you>.workers.dev
//   LICENSE_ADMIN_TOKEN  the ADMIN_TOKEN secret set on the Worker

import { webcrypto as crypto } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
import { makeCode, formatCode } from './src/utils/licenseCode.js';

const DEFAULT_DAYS = 365;
const MAX_DAYS = 3650;

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const count = Number(flag('count', '0'));
const batch = flag('batch');
const deviceLimit = Number(flag('limit', '2'));
const expiresRaw = flag('expires');
const daysRaw = flag('days');
const perpetual = has('perpetual');
const dryRun = has('dry-run');

if (!Number.isInteger(count) || count < 1 || count > 500) {
  console.error('--count must be between 1 and 500 (the Worker rejects larger batches).');
  process.exit(1);
}
if (!batch) {
  console.error('--batch is required: name the run, e.g. "2026-01-sklep". It is how you find these codes again.');
  process.exit(1);
}
if (!Number.isInteger(deviceLimit) || deviceLimit < 1 || deviceLimit > 20) {
  console.error('--limit must be between 1 and 20.');
  process.exit(1);
}
if (perpetual && daysRaw) {
  console.error('--perpetual and --days contradict each other; pass one.');
  process.exit(1);
}

// null is perpetual; otherwise the number of days from first activation.
let validDays = DEFAULT_DAYS;
if (perpetual) {
  validDays = null;
} else if (daysRaw) {
  validDays = Number(daysRaw);
  if (!Number.isInteger(validDays) || validDays < 1 || validDays > MAX_DAYS) {
    console.error(`--days must be a whole number of days between 1 and ${MAX_DAYS}.`);
    process.exit(1);
  }
}

// A fixed date is checked against the device clock once the tablet is offline,
// so it is weaker than it looks. It is for review copies and handouts that must
// stop on a known day whenever they were first used.
let expiresAt = null;
if (expiresRaw) {
  const parsed = Date.parse(`${expiresRaw}T23:59:59Z`);
  if (Number.isNaN(parsed)) {
    console.error('--expires must be a date like 2027-01-01.');
    process.exit(1);
  }
  expiresAt = Math.floor(parsed / 1000);
}

const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

const sha256Hex = async (text) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

// Minting into a Set first: 55 bits will not collide, but a batch script is a
// bad place to find that out empirically.
const canonical = new Set();
while (canonical.size < count) canonical.add(makeCode(randomBytes));

const rows = [];
for (const code of canonical) {
  const hash = await sha256Hex(code);
  rows.push({
    code,
    printed: formatCode(code),
    hash,
    // The short public reference the token carries and support quotes. Derived
    // from the hash, so it can be recovered from a code but not the reverse.
    cid: hash.slice(0, 12),
    deviceLimit,
    expiresAt,
    validDays
  });
}

const stamp = new Date().toISOString().slice(0, 10);
const safeBatch = batch.replace(/[^a-zA-Z0-9._-]/g, '-');
const outPath = flag('out', `codes-${safeBatch}-${stamp}.csv`);

if (existsSync(outPath)) {
  console.error(`${outPath} already exists. Refusing to overwrite - the codes in it may be the only copy.`);
  process.exit(1);
}

// valid_days is the last column so a CSV from before it existed still reads the
// same way; license_admin.mjs upload treats a missing value as the default year.
const csv = [
  'code,cid,batch,device_limit,expires,valid_days',
  ...rows.map((r) =>
    [r.printed, r.cid, batch, r.deviceLimit, expiresRaw || 'never', r.validDays ?? 'perpetual'].join(',')
  )
].join('\n');

writeFileSync(outPath, `${csv}\n`, 'utf8');
console.log(`Wrote ${rows.length} codes to ${outPath}`);
console.log(
  validDays === null
    ? 'Licence: perpetual.'
    : `Licence: ${validDays} days from each code's first activation.`
);

if (dryRun) {
  console.log('\n--dry-run: nothing was sent to the server, so these codes will NOT activate.');
  console.log('Delete the CSV and run again without --dry-run.');
  process.exit(0);
}

const url = process.env.LICENSE_ADMIN_URL;
const token = process.env.LICENSE_ADMIN_TOKEN;
if (!url || !token) {
  console.error('\nLICENSE_ADMIN_URL and LICENSE_ADMIN_TOKEN must be set to register the batch.');
  console.error(`The CSV is written, but these codes will not activate until they are uploaded.`);
  process.exit(1);
}

const response = await fetch(`${url.replace(/\/$/, '')}/admin/codes`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    batch,
    codes: rows.map(({ hash, cid, deviceLimit: lim, expiresAt: exp, validDays: days }) => ({
      hash,
      cid,
      deviceLimit: lim,
      expiresAt: exp,
      validDays: days
    }))
  })
});

const result = await response.json().catch(() => null);
if (!response.ok) {
  console.error(`\nUpload failed (${response.status}): ${result?.error || 'unknown'}`);
  console.error(`The CSV at ${outPath} is kept - fix the problem and upload it again rather than minting more.`);
  process.exit(1);
}

console.log(`Registered ${result.inserted} of ${result.submitted} codes with the licence server.`);
console.log(`\nKeep ${outPath} safe. It is the only copy of these codes.`);
