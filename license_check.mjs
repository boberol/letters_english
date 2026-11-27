// The real check on the licence server, in the spirit of check_letters.cjs: a
// standalone script, no framework, run when you have changed something and want
// to know it still holds.
//
//   cd worker && npx wrangler dev --port 8788      (in one terminal)
//   node license_check.mjs                          (in another)
//
// It exercises the Worker end to end - registering a batch, spending device
// slots, verifying real tokens against the real public key - because the parts
// worth being sure about only exist once the pieces are talking to each other.
// The device limit is a conditional INSERT, the token binding is a signature
// over a device id, and neither can be checked by reading the code.
//
// It writes to whatever database it points at and it deliberately trips the
// rate limiter at the end, so it refuses a non-localhost URL unless you pass
// --i-know-this-is-production.
//
// Needs:
//   LICENSE_ADMIN_URL     default http://127.0.0.1:8788
//   LICENSE_ADMIN_TOKEN   default test-admin-token (what .dev.vars usually has)
//   LICENSE_PUBLIC_KEY    the base64 SPKI key matching the Worker's secret

import { webcrypto as crypto } from 'node:crypto';
import { makeCode, normaliseCode, formatCode } from './src/utils/licenseCode.js';

const BASE = (process.env.LICENSE_ADMIN_URL || 'http://127.0.0.1:8788').replace(/\/$/, '');
const ADMIN = process.env.LICENSE_ADMIN_TOKEN || 'test-admin-token';
const PUBLIC_KEY = process.env.LICENSE_PUBLIC_KEY || '';
const DAY = 86400;

const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(BASE);
if (!isLocal && !process.argv.includes('--i-know-this-is-production')) {
  console.error(`Refusing to run against ${BASE}.`);
  console.error('This script creates codes and deliberately trips the rate limiter.');
  console.error('Pass --i-know-this-is-production if you really mean it.');
  process.exit(1);
}
if (!PUBLIC_KEY) {
  console.error('LICENSE_PUBLIC_KEY is not set - without it the token checks cannot run.');
  console.error('It is the VITE_LICENSE_PUBLIC_KEY value from .env.');
  process.exit(1);
}

let passed = 0;
let failed = 0;
const check = (name, condition, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  ${detail}` : ''}`);
  }
};

const fromB64 = (s) =>
  new Uint8Array(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));

const verifyKey = await crypto.subtle.importKey(
  'spki',
  fromB64(PUBLIC_KEY),
  { name: 'ECDSA', namedCurve: 'P-256' },
  false,
  ['verify']
);

// Deliberately a re-implementation of what src/utils/license.js does, not an
// import of it: this is the check, and a check that shares its implementation
// with the thing it checks proves nothing.
const verifyToken = async (token, deviceId) => {
  if (typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const claimsB64 = token.slice(0, dot);
  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      verifyKey,
      fromB64(token.slice(dot + 1)),
      new TextEncoder().encode(claimsB64)
    );
  } catch (e) {
    return null;
  }
  if (!valid) return null;
  const claims = JSON.parse(Buffer.from(fromB64(claimsB64)).toString('utf8'));
  if (claims.v !== 1) return null;
  if (claims.did !== deviceId) return null;
  if (claims.exp && Date.now() / 1000 > claims.exp) return null;
  return claims;
};

const post = async (path, body, token) => {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const activate = (code, deviceId) => post('/activate', { code, deviceId }, null);
const uuid = () => crypto.randomUUID();
const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256Hex = async (text) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

const now = Math.floor(Date.now() / 1000);
const codePair = makeCode(randomBytes);
const codeDated = makeCode(randomBytes);
const codeKill = makeCode(randomBytes);
const codeYear = makeCode(randomBytes);
const hash = {};
for (const c of [codePair, codeDated, codeKill, codeYear]) hash[c] = await sha256Hex(c);
const cid = (c) => hash[c].slice(0, 12);

console.log(`\nlicence check against ${BASE}\n`);

console.log('registering a batch');
const upload = await post(
  '/admin/codes',
  {
    batch: `check-${now}`,
    codes: [
      // Perpetual on purpose, so the device-limit checks below are not also
      // checks on end dates.
      { hash: hash[codePair], cid: cid(codePair), deviceLimit: 2, expiresAt: null, validDays: null },
      { hash: hash[codeDated], cid: cid(codeDated), deviceLimit: 2, expiresAt: now - 3600 },
      { hash: hash[codeKill], cid: cid(codeKill), deviceLimit: 2, expiresAt: null },
      // No validDays at all: what an older script sends, and what must get the
      // default year.
      { hash: hash[codeYear], cid: cid(codeYear), deviceLimit: 2, expiresAt: null }
    ]
  },
  ADMIN
);
check('a batch registers', upload.status === 200 && upload.body?.inserted === 4, JSON.stringify(upload.body));
check('admin refuses a missing token', (await post('/admin/codes', { codes: [] }, null)).status === 401);
check('admin refuses a wrong token', (await post('/admin/codes', { codes: [] }, 'nope')).status === 401);
const strayHash = await sha256Hex(makeCode(randomBytes));
const zeroDays = await post(
  '/admin/codes',
  { batch: 'check-invalid', codes: [{ hash: strayHash, cid: strayHash.slice(0, 12), deviceLimit: 2, validDays: 0 }] },
  ADMIN
);
check('a licence length outside 1..3650 days is refused', zeroDays.status === 400, JSON.stringify(zeroDays.body));

console.log('\nthe device limit');
const devA = uuid();
const devB = uuid();
const devC = uuid();

const first = await activate(codePair, devA);
check('the first device activates', first.status === 200 && typeof first.body?.token === 'string');
const claims = await verifyToken(first.body?.token, devA);
check('its token verifies against the public key', Boolean(claims));
check('the token carries the code reference, never the code', claims?.cid === cid(codePair) && !JSON.stringify(claims || {}).includes(codePair));
check('a perpetual code issues a token with no end date', claims?.exp === null, JSON.stringify(claims));

const second = await activate(codePair, devB);
check('the second device activates', second.status === 200);
const third = await activate(codePair, devC);
check('the third device is refused', third.status === 409 && third.body?.error === 'device-limit', JSON.stringify(third.body));

console.log('\ntokens are bound to one device');
check('a token from device 1 is rejected on device 3', (await verifyToken(first.body?.token, devC)) === null);
check('a token from device 2 is rejected on device 1', (await verifyToken(second.body?.token, devA)) === null);

console.log('\nre-activation does not spend a slot');
check('device 1 can redeem again', (await activate(codePair, devA)).status === 200);
check('and the third device is still refused', (await activate(codePair, devC)).status === 409);

console.log('\na year from the first activation');
const yearA = uuid();
const yearB = uuid();
const y1 = await activate(codeYear, yearA);
const yc1 = await verifyToken(y1.body?.token, yearA);
check('a default code activates with an end date', Boolean(yc1) && typeof yc1.exp === 'number', JSON.stringify(y1.body));
check(
  'the end date is 365 days after the first activation',
  Boolean(yc1) && yc1.exp === yc1.iat + 365 * DAY,
  JSON.stringify(yc1)
);
// Long enough that a clock restarted by the second activation would show in
// the token's whole-second timestamps.
await sleep(1500);
const y2 = await activate(codeYear, yearB);
const yc2 = await verifyToken(y2.body?.token, yearB);
check(
  'a device added later gets the same end date, not a fresh year',
  Boolean(yc2) && yc2.iat > yc1.iat && yc2.exp === yc1.exp,
  JSON.stringify(yc2)
);
check('freeing every slot on it works', (await post('/admin/reset', { cid: cid(codeYear) }, ADMIN)).body?.released === 2);
const yearC = uuid();
const yc3 = await verifyToken((await activate(codeYear, yearC)).body?.token, yearC);
check('and a reset does not restart the year', Boolean(yc3) && yc3.exp === yc1.exp, JSON.stringify(yc3));
const yearLook = await post('/admin/lookup', { cid: cid(codeYear) }, ADMIN);
check(
  'lookup reports the length, the first use and the end date',
  yearLook.body?.validDays === 365 && yearLook.body?.firstUsedAt === yc1.iat && yearLook.body?.licenceEndsAt === yc1.exp,
  JSON.stringify(yearLook.body)
);

console.log('\nrejections');
check('an unregistered code is unknown', (await activate(makeCode(randomBytes), uuid())).status === 404);
check('a short code is a bad request', (await activate('ABC', uuid())).status === 400);
const badCheck = codePair.slice(0, 11) + (codePair[11] === 'Z' ? 'Y' : 'Z');
check('a bad check character is a bad request', (await activate(badCheck, uuid())).status === 400);
check('a non-uuid device id is a bad request', (await activate(codePair, 'tablet-1')).status === 400);
const dated = await activate(codeDated, uuid());
check('a code past its fixed end date is refused', dated.status === 403 && dated.body?.error === 'code-expired', JSON.stringify(dated.body));
check('GET is not allowed', (await fetch(`${BASE}/activate`)).status === 405);

console.log('\nwhat a parent actually types');
const messy = formatCode(codeKill).toLowerCase().replace(/-/g, ' ');
check('lowercase and spaced normalises to the same code', normaliseCode(messy) === codeKill);
check('and it activates', (await activate(normaliseCode(messy), uuid())).status === 200);

console.log('\nsupport');
const look = await post('/admin/lookup', { cid: cid(codePair) }, ADMIN);
check('lookup reports the devices used', look.status === 200 && look.body?.activations?.length === 2, JSON.stringify(look.body));
check('lookup never returns the code itself', !JSON.stringify(look.body || {}).includes(codePair));
const freed = await post('/admin/reset', { cid: cid(codePair), deviceId: devB }, ADMIN);
check('reset frees one named device', freed.status === 200 && freed.body?.released === 1);
check('so a replacement tablet can activate', (await activate(codePair, devC)).status === 200);
check('reset with no device frees them all', (await post('/admin/reset', { cid: cid(codePair) }, ADMIN)).body?.released === 2);
check('disable switches a code off', (await post('/admin/disable', { cid: cid(codeKill) }, ADMIN)).status === 200);
const killed = await activate(codeKill, uuid());
check('and it stops activating', killed.status === 403 && killed.body?.error === 'code-disabled');
check('enable switches it back on', (await post('/admin/disable', { cid: cid(codeKill), disabled: false }, ADMIN)).status === 200);
check('and it activates again', (await activate(codeKill, uuid())).status === 200);

// Last, always: this blocks the machine running the script for the length of
// the throttle window, so nothing after it would be able to activate.
console.log('\nrate limiting (last - it blocks this IP for a while)');
let throttled = false;
let tries = 0;
for (let i = 0; i < 25; i += 1) {
  tries += 1;
  if ((await activate(makeCode(randomBytes), uuid())).status === 429) {
    throttled = true;
    break;
  }
}
check(`repeated unknown codes get throttled (after ${tries})`, throttled);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
