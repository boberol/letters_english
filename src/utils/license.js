// Whether this device is allowed to run the app, and how it got that way.
//
// A singleton with the same shape as `progress` and `sounds`: one instance,
// every localStorage touch wrapped so a private-mode browser cannot throw, and
// subscribe/getSnapshot on top so components read it through
// useSyncExternalStore with no provider.
//
// The bargain that makes this work in an app built to run with no network:
// *activation* is online, *use* is not. Redeeming a code is one POST, once, and
// what comes back is a licence token signed by a key the app does not have.
// From then on every launch verifies that signature locally, so a tablet that
// never sees the network again keeps working. That single round trip is also
// the only thing that makes the device limit real - a purely local check cannot
// know a code was already used on somebody else's tablet, because it has nobody
// to ask.
//
// What this does not do: stop somebody who edits the bundle. The check runs on
// the user's device, so it is patchable by anyone willing to read the
// JavaScript, and the build is precached and copyable regardless. This raises
// the bar to "a code cannot be forged and cannot be passed around", which is the
// part that costs sales; it is not, and cannot be, tamper-proof.

import { normaliseCode, isWellFormedCode } from './licenseCode';

const TOKEN_KEY = 'letter_app_license_v1';
const DEVICE_KEY = 'letter_app_device_v1';

const ACTIVATION_URL = import.meta.env.VITE_ACTIVATION_URL || '';
const PUBLIC_KEY_B64 = import.meta.env.VITE_LICENSE_PUBLIC_KEY || '';

// Skipping the gate is a development convenience and must never be one in
// production. `import.meta.env.DEV` is a literal false in any `vite build`, so
// this whole branch is dead code the bundler drops - a stray flag left in a
// deployed .env cannot switch the lock off.
const DEV_BYPASS =
  import.meta.env.DEV && import.meta.env.VITE_LICENSE_DEV_BYPASS === 'true';

// How long to wait for the activation endpoint before calling it a network
// problem. A parent standing at a tablet needs an answer, not a spinner.
const ACTIVATION_TIMEOUT_MS = 15000;

// How far the device clock may disagree with the server at activation before it
// counts as wrong rather than merely unsynchronised.
const CLOCK_TOLERANCE_S = 24 * 60 * 60;

const nowSeconds = () => Date.now() / 1000;

const base64ToBytes = (b64) => {
  const binary = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const randomUuid = () => {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch (e) {
    // randomUUID needs a secure context; fall through to the manual form.
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)
  ].join('-');
};

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A browser has no stable hardware identifier, and the ones people build out of
// fingerprinting are both unreliable and a privacy problem on a child's device.
// So the device id is simply a random UUID minted on first run. Clearing site
// data loses it and costs the parent a re-activation - which is why the server
// keeps a code redeemable by a device it has already seen without spending a
// second slot, and why there is a reset endpoint for a tablet that is genuinely
// replaced.
const loadDeviceId = () => {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved && UUID_SHAPE.test(saved)) return saved;
  } catch (e) {
    // Storage disabled: a fresh id every launch, so every launch asks for the
    // code. Nothing here can help with that.
  }
  const fresh = randomUuid();
  try {
    localStorage.setItem(DEVICE_KEY, fresh);
  } catch (e) {
    // As above.
  }
  return fresh;
};

let publicKeyPromise = null;
const getPublicKey = () => {
  if (!publicKeyPromise) {
    publicKeyPromise = crypto.subtle.importKey(
      'spki',
      base64ToBytes(PUBLIC_KEY_B64),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
  }
  return publicKeyPromise;
};

/**
 * Check a token was issued by the server, to this device, and return its
 * claims - or null if it is not usable here. Whether the licence has run out is
 * a separate question (`isExpired`), because an expired licence and a forged
 * one need different words on the screen.
 *
 * The token is base64url(claims) + "." + base64url(signature), and the
 * signature covers the encoded claims exactly as they arrived - so it survives
 * being stored as a string and read back with no re-serialisation to get wrong.
 */
const verifyToken = async (token, deviceId) => {
  if (typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;

  const claimsB64 = token.slice(0, dot);
  const signatureB64 = token.slice(dot + 1);

  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      await getPublicKey(),
      base64ToBytes(signatureB64),
      new TextEncoder().encode(claimsB64)
    );
  } catch (e) {
    return null;
  }
  if (!valid) return null;

  let claims;
  try {
    claims = JSON.parse(new TextDecoder().decode(base64ToBytes(claimsB64)));
  } catch (e) {
    return null;
  }

  if (claims.v !== 1) return null;
  // The signature proves the server issued this token; this proves it issued it
  // to *this* device. Without it, copying the localStorage value from one tablet
  // to another would defeat the whole thing.
  if (claims.did !== deviceId) return null;

  return claims;
};

// Licences run for a year from the code's first activation, and the end date
// comes signed inside the token. It can only be checked against the device
// clock, which the device owns: a tablet with its date wound back keeps a
// licence past its end. Guarding against that means trusting the clock less in
// the other direction too, and a cheap tablet whose clock jumps forward once
// would then lock a paying family out for good - the worse failure of the two.
const isExpired = (claims) => Boolean(claims.exp) && nowSeconds() > claims.exp;

const idleState = (status, extra = {}) => ({
  status,
  busy: false,
  error: null,
  claims: null,
  // True when this device had a licence and it ran out, so the activation
  // screen asks for a new code instead of greeting a first-time parent.
  expired: false,
  ...extra
});

class LicenseStore {
  constructor() {
    this.listeners = new Set();
    this.deviceId = loadDeviceId();

    if (DEV_BYPASS) {
      this.state = idleState('unlocked');
      return;
    }
    if (!PUBLIC_KEY_B64 || !ACTIVATION_URL) {
      // A build with no key cannot tell a real token from a made-up one, so it
      // locks rather than trusting whatever is in storage. Failing open here
      // would mean one missing environment variable silently ships the app
      // unlocked, and nobody would notice until it had shipped.
      this.state = idleState('unconfigured');
      return;
    }

    this.state = idleState('checking');
    this.restore();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Must stay the same object until something actually changes, or
  // useSyncExternalStore re-renders forever.
  getSnapshot() {
    return this.state;
  }

  commit(next) {
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }

  getDeviceId() {
    return this.deviceId;
  }

  async restore() {
    let stored = null;
    try {
      stored = localStorage.getItem(TOKEN_KEY);
    } catch (e) {
      // Nothing readable saved: the gate below asks for the code.
    }

    const claims = stored ? await verifyToken(stored, this.deviceId) : null;
    if (claims && !isExpired(claims)) {
      this.commit(idleState('unlocked', { claims }));
      return;
    }

    if (claims) {
      // A genuine licence that has run out. The token is kept rather than
      // dropped: if the fault is a tablet clock set in the future, putting the
      // date right and reopening the app unlocks it again with no code at all.
      this.commit(idleState('locked', { expired: true, error: 'licence-expired', claims }));
      return;
    }

    if (stored) {
      // Signed for another device, or damaged. Drop it so the next launch does
      // not pay for the check again.
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch (e) {
        // Leaving it costs nothing; it just fails the same way next time.
      }
    }
    this.commit(idleState('locked'));
  }

  /**
   * Redeem a code for this device.
   *
   * @param typed whatever was in the input box, in any spacing or case
   * @returns true when the app is now unlocked; on false, state.error holds a
   *          reason string the activation screen turns into a sentence.
   */
  async activate(typed) {
    const code = normaliseCode(typed);
    if (!isWellFormedCode(code)) {
      // Caught here rather than at the server, so an ordinary typo answers
      // instantly and does not count against the rate limit.
      this.commit({ ...this.state, busy: false, error: 'invalid-code' });
      return false;
    }

    this.commit({ ...this.state, busy: true, error: null });

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), ACTIVATION_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(ACTIVATION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, deviceId: this.deviceId }),
        signal: abort.signal
      });
    } catch (e) {
      // The request never got an answer: no network, the timeout above, or a
      // CORS refusal - which a page cannot tell apart from being offline.
      clearTimeout(timer);
      this.commit({ ...this.state, busy: false, error: 'offline' });
      return false;
    }

    // The server did answer, so whatever is wrong now is not the parent's
    // network. A body that is not JSON - a Cloudflare error page, a proxy, a
    // wrong endpoint baked into the build - used to throw into the branch above
    // and tell them to check their internet, which sends a support conversation
    // looking in the wrong place. Read under the same timeout, so a response
    // that stalls halfway through its body still ends.
    const payload = await response.json().catch(() => null);
    clearTimeout(timer);

    if (!response.ok || !payload || typeof payload.token !== 'string') {
      const reason = typeof payload?.error === 'string' ? payload.error : 'server-error';
      this.commit({ ...this.state, busy: false, error: reason });
      return false;
    }

    // The server is trusted no further than its signature goes: the token it
    // just sent is checked exactly as a stored one would be.
    const claims = await verifyToken(payload.token, this.deviceId);
    if (!claims) {
      this.commit({ ...this.state, busy: false, error: 'server-error' });
      return false;
    }

    try {
      localStorage.setItem(TOKEN_KEY, payload.token);
    } catch (e) {
      // Unlocks this session but not the next one - better than refusing a code
      // that has just been paid for.
    }

    if (isExpired(claims)) {
      // The server only issues a licence that is still running by its own
      // clock, so if this device already calls it expired, this device's clock
      // is the odd one out. `iat` is the server's time of issue, a moment ago,
      // which says by how much - and whether to ask the parent to fix the date
      // rather than tell them a brand-new code has run out. The token is stored
      // above either way, so a corrected clock unlocks on the next launch.
      const clockWrong = Math.abs(nowSeconds() - claims.iat) > CLOCK_TOLERANCE_S;
      this.commit({ ...this.state, busy: false, error: clockWrong ? 'clock-wrong' : 'code-expired' });
      return false;
    }

    this.commit(idleState('unlocked', { claims }));
    return true;
  }

  clearError() {
    if (!this.state.error) return;
    this.commit({ ...this.state, error: null });
  }

  /** Forget the licence on this device. For support, not for the UI. */
  deactivate() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      // Nothing to do; the token stays and so does the unlock.
    }
    this.commit(idleState('locked'));
  }
}

export const license = new LicenseStore();

// The support channel for a parent on the phone with you: it hands over the
// device id to reset, and the date the licence runs to, without putting any of
// it on a screen a child uses.
if (typeof window !== 'undefined') {
  window.__playGoo = {
    deviceId: () => license.getDeviceId(),
    status: () => license.getSnapshot().status,
    claims: () => license.getSnapshot().claims,
    endsAt: () => {
      const exp = license.getSnapshot().claims?.exp;
      return exp ? new Date(exp * 1000).toISOString().slice(0, 10) : 'never';
    },
    deactivate: () => license.deactivate()
  };
}
