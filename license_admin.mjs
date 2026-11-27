// Support desk for the licence server: look a code up, free a device slot,
// switch a code off, or re-upload a batch whose registration failed.
//
//   node license_admin.mjs lookup  <cid|code>
//   node license_admin.mjs reset   <cid|code> [device-uuid]
//   node license_admin.mjs disable <cid|code>
//   node license_admin.mjs enable  <cid|code>
//   node license_admin.mjs upload  codes-2026-01-sklep-2026-01-14.csv
//
// A code may be given either way round. `cid` is the short reference printed in
// the batch CSV and carried in the licence token - prefer it, because it is not
// a secret and can safely be pasted into an email thread. A full code is
// accepted for the case where the parent has the card and you do not have the
// CSV to hand; it is hashed locally and only the cid is sent.
//
// Needs, in the environment:
//   LICENSE_ADMIN_URL    https://nauka-liter-licence.<you>.workers.dev
//   LICENSE_ADMIN_TOKEN  the ADMIN_TOKEN secret set on the Worker

import { webcrypto as crypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { normaliseCode, isWellFormedCode } from './src/utils/licenseCode.js';

const [command, ...rest] = process.argv.slice(2);

const url = process.env.LICENSE_ADMIN_URL;
const token = process.env.LICENSE_ADMIN_TOKEN;
if (!url || !token) {
  console.error('LICENSE_ADMIN_URL and LICENSE_ADMIN_TOKEN must be set.');
  process.exit(1);
}

const sha256Hex = async (text) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** Accept either a 12-hex cid or a full activation code, return the cid. */
const toCid = async (given) => {
  const raw = String(given || '').trim();
  if (/^[0-9a-f]{12}$/i.test(raw)) return raw.toLowerCase();

  const code = normaliseCode(raw);
  if (isWellFormedCode(code)) return (await sha256Hex(code)).slice(0, 12);

  console.error(`"${given}" is neither a code reference nor a well-formed code.`);
  process.exit(1);
};

const call = async (path, body) => {
  const response = await fetch(`${url.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    console.error(`${path} failed (${response.status}): ${payload?.error || 'unknown'}`);
    process.exit(1);
  }
  return payload;
};

const when = (unix) => (unix ? new Date(unix * 1000).toISOString().replace('T', ' ').slice(0, 16) : '-');

// What a parent asking "until when?" needs answered, in one line.
const licenceLine = (info) => {
  const now = Date.now() / 1000;
  if (info.licenceEndsAt) {
    const days = Math.ceil((info.licenceEndsAt - now) / 86400);
    return days > 0
      ? `${when(info.licenceEndsAt)}  (${days} day${days === 1 ? '' : 's'} left)`
      : `${when(info.licenceEndsAt)}  (EXPIRED)`;
  }
  if (info.validDays && !info.firstUsedAt) return `${info.validDays} days from first activation - not activated yet`;
  return 'never';
};

if (command === 'lookup') {
  const info = await call('/admin/lookup', { cid: await toCid(rest[0]) });
  console.log(`
  code        ${info.cid}
  batch       ${info.batch || '-'}
  devices     ${info.activations.length} of ${info.deviceLimit}
  status      ${info.disabled ? 'DISABLED' : 'active'}
  licence     ${info.validDays ? `${info.validDays} days from first activation` : 'perpetual'}${info.expiresAt ? `, and no later than ${when(info.expiresAt)}` : ''}
  first used  ${when(info.firstUsedAt)}
  ends        ${licenceLine(info)}
  created     ${when(info.createdAt)}
`);
  if (info.activations.length) {
    console.log('  activations');
    for (const a of info.activations) {
      console.log(`    ${a.device_id}   first ${when(a.activated_at)}   last ${when(a.last_seen_at)}`);
    }
    console.log();
  }
} else if (command === 'reset') {
  // With no device id this frees every slot on the code - the right move when a
  // parent has replaced a tablet and cannot tell you which id was the old one.
  // They then re-enter the same code on the devices they still have.
  const result = await call('/admin/reset', {
    cid: await toCid(rest[0]),
    ...(rest[1] ? { deviceId: rest[1] } : {})
  });
  console.log(`Freed ${result.released} device slot(s) on ${result.cid}.`);
  console.log('The parent can now enter the same code again on the device they are using.');
  console.log('The licence end date does not move - a reset frees slots, it does not restart the year.');
} else if (command === 'disable' || command === 'enable') {
  const result = await call('/admin/disable', {
    cid: await toCid(rest[0]),
    disabled: command === 'disable'
  });
  console.log(`${result.cid} is now ${result.disabled ? 'disabled' : 'active'}.`);
  if (result.disabled) {
    // Worth saying out loud: this is not revocation. Tokens already issued are
    // verified offline against a signature, so a tablet that is already
    // activated keeps working until its licence end date.
    console.log('Note: devices already activated keep working until their licence ends - it is checked offline.');
    console.log('This only stops the code being redeemed on anything new.');
  }
} else if (command === 'upload') {
  // For a batch whose CSV was written but whose upload failed. Re-derives the
  // hashes from the codes in the file, so it is safe to run twice: the server
  // ignores codes it already holds.
  const path = rest[0];
  if (!path) {
    console.error('upload needs a CSV path.');
    process.exit(1);
  }
  const lines = readFileSync(path, 'utf8').trim().split(/\r?\n/);
  const header = lines.shift();
  if (!header || !header.startsWith('code,cid,batch,device_limit')) {
    console.error(`${path} does not look like a batch CSV from license_codes.mjs.`);
    process.exit(1);
  }

  let batch = null;
  const codes = [];
  for (const line of lines) {
    const [printed, , csvBatch, limit, expires, days] = line.split(',');
    const code = normaliseCode(printed);
    if (!isWellFormedCode(code)) {
      console.error(`Skipping unreadable row: ${line}`);
      continue;
    }
    batch = batch || csvBatch;
    const hash = await sha256Hex(code);
    codes.push({
      hash,
      cid: hash.slice(0, 12),
      deviceLimit: Number(limit),
      expiresAt:
        !expires || expires === 'never'
          ? null
          : Math.floor(Date.parse(`${expires}T23:59:59Z`) / 1000),
      // A CSV from before valid_days existed has no sixth column. Leaving the
      // field out lets the server apply its default year.
      ...(days === undefined || days === '' ? {} : { validDays: days === 'perpetual' ? null : Number(days) })
    });
  }

  const result = await call('/admin/codes', { batch, codes });
  console.log(`Registered ${result.inserted} of ${result.submitted} codes (already-known codes are skipped).`);
} else {
  console.log(`
  node license_admin.mjs lookup  <cid|code>              what this code is, where it is used, and when its licence ends
  node license_admin.mjs reset   <cid|code> [device]     free one device slot, or all of them
  node license_admin.mjs disable <cid|code>              stop the code being redeemed on anything new
  node license_admin.mjs enable  <cid|code>              undo a disable
  node license_admin.mjs upload  <batch.csv>             re-register a batch whose upload failed
`);
  process.exit(command ? 1 : 0);
}
