// PlayGoo licence server - a Cloudflare Worker in front of a D1 database.
//
// It exists to answer one question the app cannot answer for itself: has this
// code already been used on somebody else's tablet? Everything else about the
// licence is offline. The Worker is touched once, when a code is redeemed, and
// what it hands back is a token signed with a key that never leaves it. The app
// verifies that signature against the bundled public key on every launch
// afterwards, with no network at all.
//
// D1 rather than KV, on purpose. Counting activations is a read-modify-write on
// one row, and KV is eventually consistent across colos - a parent activating a
// tablet and a phone back to back could have both reads see an empty list and
// both writes succeed, quietly turning a two-device code into a three-device
// one. D1 is SQLite with a single writer, so the slot is claimed by one
// conditional INSERT that either changes a row or does not.

const TOKEN_VERSION = 1;

// Failed attempts per IP per window. A code is 55 bits, so this is not what
// stops a brute force - arithmetic already does. It is here to keep somebody
// hammering the endpoint from turning into a D1 bill.
const THROTTLE_WINDOW_S = 600;
const THROTTLE_MAX_FAILURES = 12;

// A licence runs for a number of days counted from the code's first activation
// on any device, not from when it was minted or sold: a code can sit in a drawer
// for months before a parent types it in, and that should not cost them. A
// batch registered without saying otherwise gets a year. NULL in the database
// means perpetual.
const DAY_S = 86400;
const DEFAULT_VALID_DAYS = 365;
const MAX_VALID_DAYS = 3650;

/* ── code normalisation ───────────────────────────────────────────────────
   A deliberate copy of src/utils/licenseCode.js rather than a shared import.
   This is a separate deployable, and more importantly the canonical form of a
   code is what gets hashed and looked up - taking the client's word for it
   would let a patched client decide what a code means. Keep the two in step;
   the alphabet and the check rule are the whole of it.                      */

const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_DATA_LENGTH = 11;
const CODE_LENGTH = CODE_DATA_LENGTH + 1;
const LOOKALIKES = { I: '1', L: '1', O: '0' };

const normaliseCode = (input) => {
  if (typeof input !== 'string') return '';
  let out = '';
  for (const typed of input.toUpperCase()) {
    const ch = LOOKALIKES[typed] ?? typed;
    if (CODE_ALPHABET.includes(ch)) out += ch;
  }
  return out;
};

const codeChecksum = (data) => {
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) {
    const value = CODE_ALPHABET.indexOf(data[i]);
    if (value < 0) return null;
    sum += value * (i + 1);
  }
  return CODE_ALPHABET[sum % CODE_ALPHABET.length];
};

const isWellFormedCode = (canonical) =>
  canonical.length === CODE_LENGTH &&
  codeChecksum(canonical.slice(0, CODE_DATA_LENGTH)) === canonical[CODE_DATA_LENGTH];

/* ── helpers ─────────────────────────────────────────────────────────────── */

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CID_SHAPE = /^[0-9a-f]{12}$/i;

const bytesToHex = (buffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

const sha256Hex = async (text) =>
  bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

const base64ToBytes = (b64) => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const bytesToBase64Url = (buffer) => {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

// ALLOWED_ORIGIN is one origin, or several separated by commas. More than one
// is what a move between domains needs: the old address and the new one are
// both live for a while, and a build already on a tablet calls whichever it was
// built against. One origin is still the steady state - the list is not a
// wildcard by another name.
//
// The header itself can only ever name a single origin, so the request's own is
// echoed back when it is on the list. An origin that is not on it gets the
// first configured one, which the browser then refuses - that refusal is the
// whole point. None of this is a security control: a client that is not a
// browser ignores CORS entirely. It keeps other people's web pages from
// spending your quota.
const resolveOrigin = (env, request) => {
  const allowed = (env.ALLOWED_ORIGIN || '*')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (allowed.includes('*')) return '*';

  const origin = request.headers.get('Origin');
  if (origin && allowed.includes(origin)) return origin;

  return allowed[0] || '*';
};

const corsHeaders = (env) => ({
  // Resolved per request by the fetch handler below, so this is already the one
  // origin that answers this caller.
  'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
  // The answer now differs by request. Without this a cache in front of the
  // Worker could hand the header naming one origin to a page on another, and
  // the activation would fail for a reason nothing in the logs explains.
  Vary: 'Origin',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
});

const json = (env, status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(env) }
  });

// The reason strings here are the ones ActivationScreen has a Polish sentence
// for. Adding one means adding it there too, or the parent gets the fallback.
const fail = (env, status, reason) => json(env, status, { error: reason });

// When a code's licence ends, in unix seconds, or null for never. Two limits
// can apply and the earlier wins: `expires_at`, a fixed date set at minting for
// review copies and handouts, and `valid_days` counted from `first_used_at`.
// Before its first activation a code has no relative end yet - the clock has
// not started.
const licenceEnds = (row) => {
  const ends = [];
  if (row.expires_at) ends.push(row.expires_at);
  if (row.valid_days && row.first_used_at) ends.push(row.first_used_at + row.valid_days * DAY_S);
  return ends.length ? Math.min(...ends) : null;
};

/* ── token signing ───────────────────────────────────────────────────────── */

// Imported once per isolate rather than once per request: importKey is the
// expensive half of signing, and the key never changes.
let signingKeyPromise = null;
const getSigningKey = (env) => {
  if (!signingKeyPromise) {
    signingKeyPromise = crypto.subtle.importKey(
      'pkcs8',
      base64ToBytes(env.LICENSE_PRIVATE_KEY),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
  }
  return signingKeyPromise;
};

const signToken = async (env, claims) => {
  const claimsB64 = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    await getSigningKey(env),
    new TextEncoder().encode(claimsB64)
  );
  return `${claimsB64}.${bytesToBase64Url(signature)}`;
};

/* ── throttle ────────────────────────────────────────────────────────────── */

const throttleBucket = (ip, now) => `${ip}:${Math.floor(now / THROTTLE_WINDOW_S)}`;

const isThrottled = async (env, ip, now) => {
  const row = await env.DB.prepare('SELECT hits FROM throttle WHERE bucket = ?1')
    .bind(throttleBucket(ip, now))
    .first();
  return Boolean(row) && row.hits >= THROTTLE_MAX_FAILURES;
};

// Only failures are counted. A parent who activates two tablets and then reads
// the help text is not doing anything that should cost them the next attempt.
const recordFailure = (env, ip, now) =>
  env.DB.prepare(
    `INSERT INTO throttle (bucket, hits, expires_at) VALUES (?1, 1, ?2)
     ON CONFLICT(bucket) DO UPDATE SET hits = hits + 1`
  )
    .bind(throttleBucket(ip, now), now + THROTTLE_WINDOW_S * 2)
    .run();

/* ── activate ────────────────────────────────────────────────────────────── */

async function handleActivate(request, env) {
  const now = Math.floor(Date.now() / 1000);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  if (await isThrottled(env, ip, now)) return fail(env, 429, 'rate-limited');

  const body = await request.json().catch(() => null);
  const code = normaliseCode(body?.code);
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : '';

  if (!isWellFormedCode(code) || !UUID_SHAPE.test(deviceId)) {
    return fail(env, 400, 'bad-request');
  }

  // Only the hash is stored, so a dump of the database is not a sheet of
  // working codes.
  const hash = await sha256Hex(code);
  const row = await env.DB.prepare(
    `SELECT cid, device_limit, disabled, expires_at, valid_days, first_used_at
     FROM codes WHERE hash = ?1`
  )
    .bind(hash)
    .first();

  if (!row) {
    await recordFailure(env, ip, now);
    return fail(env, 404, 'unknown-code');
  }
  if (row.disabled) return fail(env, 403, 'code-disabled');

  // Checked before a slot is claimed, so an expired code cannot use one up. It
  // also answers a device that was licensed before: the year is over for every
  // device on the code at once.
  const endsBefore = licenceEnds(row);
  if (endsBefore !== null && endsBefore < now) return fail(env, 403, 'code-expired');

  const seen = await env.DB.prepare(
    'SELECT device_id FROM activations WHERE code_hash = ?1 AND device_id = ?2'
  )
    .bind(hash, deviceId)
    .first();

  if (seen) {
    // A device we have already licensed. Re-issuing costs no slot, which is
    // what makes re-installing the app, or a token going missing, harmless.
    await env.DB.prepare(
      'UPDATE activations SET last_seen_at = ?3 WHERE code_hash = ?1 AND device_id = ?2'
    )
      .bind(hash, deviceId, now)
      .run();
  } else {
    // The whole device limit, in one statement. The count and the insert happen
    // inside a single SQLite write, so two activations racing cannot both see
    // room for the last slot.
    const claim = await env.DB.prepare(
      `INSERT INTO activations (code_hash, device_id, activated_at, last_seen_at)
       SELECT ?1, ?2, ?3, ?3
       WHERE (SELECT COUNT(*) FROM activations WHERE code_hash = ?1)
             < (SELECT device_limit FROM codes WHERE hash = ?1)`
    )
      .bind(hash, deviceId, now)
      .run();

    if (!claim.meta.changes) return fail(env, 409, 'device-limit');
  }

  // Start the clock on the code's first successful activation, and never again.
  // It is written only after a slot is held, so a refused attempt does not
  // start anyone's year; the IS NULL guard makes two devices activating a new
  // code at the same moment agree on one value, which is then read back rather
  // than assumed. A support reset deletes activations but leaves this alone, so
  // "I bought a new tablet" does not also buy a new year.
  if (row.first_used_at == null) {
    await env.DB.prepare('UPDATE codes SET first_used_at = ?2 WHERE hash = ?1 AND first_used_at IS NULL')
      .bind(hash, now)
      .run();
    const started = await env.DB.prepare('SELECT first_used_at FROM codes WHERE hash = ?1')
      .bind(hash)
      .first();
    row.first_used_at = started?.first_used_at ?? now;
  }

  const token = await signToken(env, {
    v: TOKEN_VERSION,
    // The short public reference, not the code itself: the token sits in
    // localStorage on a device that may be handed around, and the code is the
    // secret.
    cid: row.cid,
    did: deviceId,
    // Server time. The app compares it with the device clock at activation to
    // tell a tablet with a wrong date apart from a licence that has run out.
    iat: now,
    // The same end date for every device on the code, however late one joins.
    exp: licenceEnds(row),
    lim: row.device_limit
  });

  return json(env, 200, { token });
}

/* ── admin ───────────────────────────────────────────────────────────────── */

// Constant-time enough for a comparison an attacker cannot iterate on quickly:
// the length is checked first, then every byte, without an early return.
const tokenMatches = (given, expected) => {
  if (typeof given !== 'string' || typeof expected !== 'string') return false;
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i += 1) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
};

const isAdmin = (request, env) => {
  const header = request.headers.get('Authorization') || '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  return Boolean(env.ADMIN_TOKEN) && tokenMatches(given, env.ADMIN_TOKEN);
};

// Load a batch of codes. The plaintext codes are never sent here - the
// generator keeps those on your machine and uploads only their hashes, so the
// only copy of a sellable code is the CSV you printed from.
async function handleAdminCodes(request, env) {
  const body = await request.json().catch(() => null);
  const codes = Array.isArray(body?.codes) ? body.codes : null;
  if (!codes || !codes.length || codes.length > 500) return fail(env, 400, 'bad-request');

  const now = Math.floor(Date.now() / 1000);
  const batch = typeof body.batch === 'string' ? body.batch.slice(0, 64) : null;
  const statements = [];

  for (const entry of codes) {
    const hash = String(entry?.hash || '').toLowerCase();
    const cid = String(entry?.cid || '').toLowerCase();
    const deviceLimit = Number(entry?.deviceLimit);
    const expiresAt = entry?.expiresAt == null ? null : Number(entry.expiresAt);
    // Left out entirely, a code gets the default year - which is what an older
    // script that has never heard of validDays sends. An explicit null is a
    // perpetual code.
    const validDays =
      entry?.validDays === undefined ? DEFAULT_VALID_DAYS : entry.validDays === null ? null : Number(entry.validDays);

    if (!/^[0-9a-f]{64}$/.test(hash) || !CID_SHAPE.test(cid)) return fail(env, 400, 'bad-request');
    if (!Number.isInteger(deviceLimit) || deviceLimit < 1 || deviceLimit > 20) {
      return fail(env, 400, 'bad-request');
    }
    if (expiresAt !== null && !Number.isInteger(expiresAt)) return fail(env, 400, 'bad-request');
    if (validDays !== null && (!Number.isInteger(validDays) || validDays < 1 || validDays > MAX_VALID_DAYS)) {
      return fail(env, 400, 'bad-request');
    }

    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO codes
           (hash, cid, batch, device_limit, disabled, expires_at, valid_days, created_at)
         VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7)`
      ).bind(hash, cid, batch, deviceLimit, expiresAt, validDays, now)
    );
  }

  const results = await env.DB.batch(statements);
  const inserted = results.reduce((sum, r) => sum + (r.meta?.changes || 0), 0);
  return json(env, 200, { inserted, submitted: codes.length });
}

// What support actually needs: is this code real, how many devices has it used,
// when did its year start and when does it end. Keyed by cid so nobody has to
// paste a live code into a chat window.
async function handleAdminLookup(request, env) {
  const body = await request.json().catch(() => null);
  const cid = String(body?.cid || '').toLowerCase();
  if (!CID_SHAPE.test(cid)) return fail(env, 400, 'bad-request');

  const code = await env.DB.prepare(
    `SELECT hash, cid, batch, device_limit, disabled, expires_at, valid_days, first_used_at, created_at
     FROM codes WHERE cid = ?1`
  )
    .bind(cid)
    .first();
  if (!code) return fail(env, 404, 'unknown-code');

  const { results } = await env.DB.prepare(
    'SELECT device_id, activated_at, last_seen_at FROM activations WHERE code_hash = ?1 ORDER BY activated_at'
  )
    .bind(code.hash)
    .all();

  return json(env, 200, {
    cid: code.cid,
    batch: code.batch,
    deviceLimit: code.device_limit,
    disabled: Boolean(code.disabled),
    expiresAt: code.expires_at,
    validDays: code.valid_days,
    firstUsedAt: code.first_used_at,
    licenceEndsAt: licenceEnds(code),
    createdAt: code.created_at,
    activations: results
  });
}

// The answer to "I bought a new tablet". Drops either one device or all of
// them, freeing the slot so the same code activates again. It deliberately
// leaves first_used_at alone: the licence still ends a year after it began.
async function handleAdminReset(request, env) {
  const body = await request.json().catch(() => null);
  const cid = String(body?.cid || '').toLowerCase();
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : '';
  if (!CID_SHAPE.test(cid)) return fail(env, 400, 'bad-request');
  if (deviceId && !UUID_SHAPE.test(deviceId)) return fail(env, 400, 'bad-request');

  const code = await env.DB.prepare('SELECT hash FROM codes WHERE cid = ?1').bind(cid).first();
  if (!code) return fail(env, 404, 'unknown-code');

  const result = deviceId
    ? await env.DB.prepare('DELETE FROM activations WHERE code_hash = ?1 AND device_id = ?2')
        .bind(code.hash, deviceId)
        .run()
    : await env.DB.prepare('DELETE FROM activations WHERE code_hash = ?1').bind(code.hash).run();

  return json(env, 200, { cid, released: result.meta.changes });
}

// Kill a code without deleting it, so a refunded or leaked code stops working
// but its history stays readable.
async function handleAdminDisable(request, env) {
  const body = await request.json().catch(() => null);
  const cid = String(body?.cid || '').toLowerCase();
  const disabled = body?.disabled === false ? 0 : 1;
  if (!CID_SHAPE.test(cid)) return fail(env, 400, 'bad-request');

  const result = await env.DB.prepare('UPDATE codes SET disabled = ?2 WHERE cid = ?1')
    .bind(cid, disabled)
    .run();
  if (!result.meta.changes) return fail(env, 404, 'unknown-code');

  // A disabled code stops issuing new tokens, but tokens already on tablets
  // keep verifying until their end date - they are checked offline against a
  // signature, and nothing reaches back to revoke them early.
  return json(env, 200, { cid, disabled: Boolean(disabled) });
}

const ADMIN_ROUTES = {
  '/admin/codes': handleAdminCodes,
  '/admin/lookup': handleAdminLookup,
  '/admin/reset': handleAdminReset,
  '/admin/disable': handleAdminDisable
};

/* ── entry point ─────────────────────────────────────────────────────────── */

export default {
  async fetch(request, rawEnv) {
    const url = new URL(request.url);

    // Settle which origin answers this caller once, here, and hand every helper
    // below an env that already carries it. The alternative is threading the
    // request down through json() and fail() to each of their call sites.
    const env = { ...rawEnv, ALLOWED_ORIGIN: resolveOrigin(rawEnv, request) };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }
    if (request.method !== 'POST') {
      return fail(env, 405, 'bad-request');
    }

    try {
      if (url.pathname === '/activate') {
        if (!env.LICENSE_PRIVATE_KEY) return fail(env, 500, 'server-error');
        return await handleActivate(request, env);
      }

      const admin = ADMIN_ROUTES[url.pathname];
      if (admin) {
        if (!isAdmin(request, env)) return fail(env, 401, 'bad-request');
        return await admin(request, env);
      }

      return fail(env, 404, 'bad-request');
    } catch (e) {
      // Never leak the message: it would carry SQL and key handling detail to
      // whoever is poking at the endpoint.
      console.error('licence worker', url.pathname, e);
      return fail(env, 500, 'server-error');
    }
  },

  // Throttle rows are the only thing here that is disposable. Sweeping them on
  // a cron keeps the table from growing without bound and costs nothing.
  async scheduled(event, env) {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare('DELETE FROM throttle WHERE expires_at < ?1').bind(now).run();
  }
};
