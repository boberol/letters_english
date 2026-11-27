// Mint the signing keypair the licence system is built on. Run once, ever.
//
//   node license_keys.mjs
//
// ECDSA on P-256 rather than Ed25519: both give a 64-byte signature, but P-256
// has been in WebCrypto everywhere for a decade, and the target here is
// whatever Android tablet a family already owns. Ed25519 landed in browsers
// recently enough that the oldest device in the room might not have it.
//
// The private key signs licence tokens and lives in exactly one place - a
// Cloudflare secret on the Worker. The public key only verifies them, so it
// ships inside the app bundle where anybody can read it. That asymmetry is the
// point: a leaked bundle lets someone check a token, never mint one.
//
// Losing the private key means every future code needs a new one; the tokens
// already on tablets keep working, because they are verified against the public
// key those builds shipped with. Replacing the key therefore means shipping a
// new build, and a tablet that never updates keeps its old licence. Keep a
// backup somewhere that is not this repository.

import { webcrypto as crypto } from 'node:crypto';

const pair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify']
);

const privateKey = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
const publicKey = Buffer.from(await crypto.subtle.exportKey('spki', pair.publicKey)).toString('base64');

console.log(`
Keypair generated. Nothing has been written to disk - copy these now.

  1. The private key goes to the Worker, and nowhere else:

       cd worker
       npx wrangler secret put LICENSE_PRIVATE_KEY

     and paste:

${privateKey}

  2. The public key goes in .env at the project root, where Vite bakes it into
     the build:

VITE_LICENSE_PUBLIC_KEY=${publicKey}

  3. While you are there, set an admin token for the batch and support scripts:

       cd worker
       npx wrangler secret put ADMIN_TOKEN

     any long random string will do, for example:

${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')}
`);
