// Set up the licence secrets in one go, and prove they work before saying so.
//
//   node license_setup.mjs
//
// Mints a signing keypair and an admin token, hands both secrets straight to the
// Worker, writes the matching public key into .env, and then checks the whole
// chain against the live Worker: the admin token is accepted, and a throwaway
// code activates and returns a token that verifies against the new public key.
//
// Why this exists alongside license_keys.mjs, which only prints the values:
// pasting a secret into `wrangler secret put` goes into a hidden prompt you
// cannot see or check, and some terminals wrap a paste in invisible control
// characters that end up stored as part of the secret. The result looks right
// and never matches - admin calls fail with 401, and activations fail with
// "server-error" once the private key and the public key in .env come from
// different runs. Nothing here is pasted: the secrets go to `wrangler secret
// bulk` through a temporary file that is deleted as soon as wrangler has read it.
//
// Running it again replaces all three values together, which is the point - the
// private key on the Worker, the public key in .env and the admin token can only
// come from the same run. Before launch that costs nothing. After launch it also
// means shipping a new build: activated tablets verify against the public key
// their build shipped with.
//
// Needs `npx wrangler login` first, the Worker deployed (worker/README.md), and
// VITE_ACTIVATION_URL set in .env for the end-to-end check.

import { webcrypto as crypto } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeCode } from './src/utils/licenseCode.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const WORKER_DIR = join(ROOT, 'worker');
const ENV_PATH = join(ROOT, '.env');

const toB64 = (buffer) => Buffer.from(buffer).toString('base64');
const fromB64 = (s) => new Uint8Array(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256Hex = async (text) =>
  Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).toString('hex');

// ------------------------------------------------------------------ mint

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const privateKey = toB64(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
const publicKey = toB64(await crypto.subtle.exportKey('spki', pair.publicKey));
const adminToken = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');

// ------------------------------------------------- secrets to the Worker

// Created exclusively and readable by this user only, and removed in `finally`
// whatever happens: it holds the private key for the moment wrangler reads it.
const secretsFile = join(
  tmpdir(),
  `nauka-liter-secrets-${Buffer.from(crypto.getRandomValues(new Uint8Array(8))).toString('hex')}.json`
);

console.log('\nSending LICENSE_PRIVATE_KEY and ADMIN_TOKEN to the Worker...\n');
let upload;
try {
  writeFileSync(secretsFile, JSON.stringify({ LICENSE_PRIVATE_KEY: privateKey, ADMIN_TOKEN: adminToken }), {
    flag: 'wx',
    mode: 0o600
  });
  // One command string with shell: true, because on Windows npx is a .cmd file
  // Node will not start directly. The path is quoted in case the temp directory
  // has a space in it.
  upload = spawnSync(`npx wrangler secret bulk "${secretsFile}"`, {
    cwd: WORKER_DIR,
    stdio: 'inherit',
    shell: true
  });
} finally {
  rmSync(secretsFile, { force: true });
}

if (!upload || upload.status !== 0) {
  console.error('\nwrangler did not accept the secrets, so nothing has changed: the Worker keeps its');
  console.error('old values and .env is untouched. Check `npx wrangler login`, then run this again.');
  process.exit(1);
}

// ---------------------------------------------------------- public key

// The secrets are live now, so .env has to follow straight away - leaving the
// old public key there would be exactly the mismatch this script is for.
if (!existsSync(ENV_PATH)) copyFileSync(join(ROOT, '.env.example'), ENV_PATH);
let env = readFileSync(ENV_PATH, 'utf8');
const keyLine = `VITE_LICENSE_PUBLIC_KEY=${publicKey}`;
env = /^VITE_LICENSE_PUBLIC_KEY=.*$/m.test(env)
  ? env.replace(/^VITE_LICENSE_PUBLIC_KEY=.*$/m, keyLine)
  : `${env.replace(/\s*$/, '')}\n${keyLine}\n`;
writeFileSync(ENV_PATH, env, 'utf8');
console.log('\nWrote the matching public key to .env.');

// ------------------------------------------------- prove it end to end

const activationUrl = (env.match(/^VITE_ACTIVATION_URL=(.*)$/m) || [])[1]?.trim() || '';
const base = activationUrl.replace(/\/activate\/?$/, '');
let verified = false;

if (!/^https:\/\//.test(base) || /your-subdomain/i.test(base)) {
  console.log('\nVITE_ACTIVATION_URL in .env is not set to the deployed Worker, so the live check is skipped.');
} else {
  const call = async (path, body, auth) => {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${adminToken}` } : {}) },
      body: JSON.stringify(body)
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  console.log(`\nChecking against ${base}`);
  try {
    // A secret change deploys a new version, and for a few seconds some requests
    // can still reach the old one. A cid nobody has is a 404 once the token is
    // accepted, and a 401 until then.
    let auth = null;
    for (let i = 0; i < 15; i += 1) {
      auth = await call('/admin/lookup', { cid: '000000000000' }, true);
      if (auth.status !== 401) break;
      await sleep(2000);
    }
    if (auth.status !== 404) throw new Error(`the admin token was not accepted (${auth.status})`);
    console.log('  ok    the admin token is accepted');

    // A throwaway code, activated once and switched off again, so the private
    // key is exercised for real: a token only verifies below if the Worker's key
    // and the one just written to .env are a pair.
    const code = makeCode((n) => crypto.getRandomValues(new Uint8Array(n)));
    const hash = await sha256Hex(code);
    const cid = hash.slice(0, 12);
    const deviceId = crypto.randomUUID();

    const registered = await call(
      '/admin/codes',
      { batch: 'setup-check', codes: [{ hash, cid, deviceLimit: 1, expiresAt: null }] },
      true
    );
    if (registered.status !== 200) throw new Error(`registering a test code failed (${registered.status})`);

    const activated = await call('/activate', { code, deviceId }, false);
    const token = activated.body?.token;
    if (activated.status !== 200 || typeof token !== 'string') {
      throw new Error(`the test code did not activate (${activated.status} ${activated.body?.error || ''})`);
    }

    const dot = token.indexOf('.');
    const verifyKey = await crypto.subtle.importKey(
      'spki',
      fromB64(publicKey),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    const signed = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      verifyKey,
      fromB64(token.slice(dot + 1)),
      new TextEncoder().encode(token.slice(0, dot))
    );
    const claims = JSON.parse(Buffer.from(fromB64(token.slice(0, dot))).toString('utf8'));
    if (!signed || claims.did !== deviceId) {
      throw new Error('the Worker signed a token that does not verify against the new public key');
    }
    console.log('  ok    a test code activates, and its licence verifies against the public key in .env');

    await call('/admin/disable', { cid }, true);
    await call('/admin/reset', { cid }, true);
    verified = true;
  } catch (e) {
    console.error(`  FAIL  ${e.message}`);
  }
}

// ---------------------------------------------------------------- hand over

console.log(`
Save these two in your password manager now. They are not stored anywhere else.

  LICENSE_PRIVATE_KEY (backup - losing it means a new build for future codes):
${privateKey}

  ADMIN_TOKEN (for minting codes and support):
${adminToken}
`);

if (verified) {
  console.log('Everything matches. Upload or mint codes with this token, for example in PowerShell:');
  console.log(`
  $env:LICENSE_ADMIN_URL="${base}"; $env:LICENSE_ADMIN_TOKEN="${adminToken}"; node license_admin.mjs upload <batch.csv>
`);
  console.log('Then rebuild the app (npm run build) so it carries the new public key.');
} else {
  console.log('The secrets and .env were updated, but the live check did not pass - see above.');
  process.exit(1);
}
