# PlayGoo — licence server

A Cloudflare Worker over a D1 database. It answers the one question the app cannot answer for
itself: *has this code already been used on somebody else's tablet?*

Everything else about the licence is offline. This is touched once, when a code is redeemed, and
what it returns is a token signed with a key that never leaves it. Design notes live in the root
`CLAUDE.md` under **The licence server**; this file is the runbook.

This is a separate deployable with its own dependencies — `npm install` here, not at the repo root.

---

## What is deployed

| | |
| --- | --- |
| Worker | `nauka-liter-licence` — https://nauka-liter-licence.bobrborys321.workers.dev |
| Database | D1 `nauka-liter-licences`, region EEUR |
| App | Pages project `naukaliterek` — https://naukaliterek.pages.dev |
| `ALLOWED_ORIGIN` | `https://naukaliterek.pages.dev` |

All of it runs on the Cloudflare free plan.

## First deploy

For a fresh account. From this folder:

```bash
npm install
npx wrangler login

# A database. Paste the printed database_id into wrangler.toml.
npx wrangler d1 create nauka-liter-licences
npm run schema:remote

# The Worker. It prints its URL. Until the secrets are set, /activate answers server-error.
npm run deploy
```

Then from the repo root:

```bash
# App settings: set VITE_ACTIVATION_URL to <the Worker URL>/activate
cp .env.example .env

# Keys, admin token and a live end-to-end check, in one run
node license_setup.mjs
```

`license_setup.mjs` mints the signing keypair and an admin token, sends both secrets to the Worker,
writes the matching public key into `.env`, and proves the whole chain against the live Worker
before it prints `Everything matches`. It shows the private key and the admin token once — put both
in a password manager, and do not paste its output anywhere else.

**Do not set the secrets by pasting into `npx wrangler secret put`.** Its prompt hides what you
paste, some terminals slip invisible characters into it, and running `license_keys.mjs` twice gives
keys that do not belong together. That is how the first setup ended up with an admin token that
always answered 401.

## Upgrading an existing database

`schema.sql` only creates tables that are missing, so a database made before a change needs that
change's migration file, once, **before** the Worker that relies on it is deployed.

| File | What it adds |
| --- | --- |
| `migrate-001-licence-duration.sql` | Licences that run for a year from first activation |

From this folder, in this order:

```bash
npx wrangler d1 execute nauka-liter-licences --remote --file=./migrate-001-licence-duration.sql
npm run deploy
```

Then rebuild and publish the app (below) so it carries the matching screens. Running a migration a
second time stops at `duplicate column name` and changes nothing. A database created from the
current `schema.sql` already has everything and needs no migration.

## Publishing the app

From the repo root:

```bash
npm run build
npx wrangler pages deploy dist --project-name naukaliterek --branch master
```

Keep `--branch master`. Without it the upload becomes a preview at a hashed address and the live
site does not change. Families get the new build the next time they open the app.

For a brand-new Pages project, create it once with
`npx wrangler pages project create <name> --production-branch master --force`, then set
`ALLOWED_ORIGIN` in `wrangler.toml` to `https://<name>.pages.dev` and run `npm run deploy` here. A new
`*.pages.dev` address can take a few minutes to start answering after its first deploy.

`ALLOWED_ORIGIN` holds exactly one origin. With it set, codes do not activate from `localhost` (the
app says there is no internet), and a site reachable at two addresses — `www` and bare — fails on one
of them. **Choose the final domain before selling codes:** licences are stored per address, so moving
later makes every tablet ask for its code again.

## Minting codes

From the repo root. PowerShell:

```powershell
$env:LICENSE_ADMIN_URL="https://nauka-liter-licence.bobrborys321.workers.dev"; $env:LICENSE_ADMIN_TOKEN="<admin token>"; node license_codes.mjs --count 50 --batch "2026-09-sklep"
```

bash:

```bash
export LICENSE_ADMIN_URL=https://nauka-liter-licence.bobrborys321.workers.dev
export LICENSE_ADMIN_TOKEN=...
node license_codes.mjs --count 50 --batch "2026-09-sklep"
```

Only hashes are uploaded. **The CSV it writes is the only copy of those codes** — back it up before
you hand any of them out. `--limit N` changes the device limit for that batch and `--dry-run` writes
the CSV without registering anything. If the upload fails, keep the CSV and run
`node license_admin.mjs upload <batch.csv>` rather than minting again.

## Licence length

A code works for **365 days from its first activation** on any device — not from when it was minted
or sold, so codes can wait in a drawer without losing time.

- A second device added months later gets the **same end date**, not a fresh year.
- A support `reset` frees device slots but **does not restart the year**.
- Once the year is over the server refuses the code, and the app on the tablet shows "Licencja
  wygasła" and asks for a new code.

Per batch, when minting:

| Flag | Effect |
| --- | --- |
| *(nothing)* | 365 days from first activation |
| `--days 30` | 30 days from first activation (1–3650) |
| `--perpetual` | never runs out |
| `--expires 2027-01-01` | also stops on that date, whichever comes first |

The app checks the end date against the tablet's clock. A tablet whose date is wound back keeps
working past its end — that is a deliberate trade-off, explained in `CLAUDE.md`.

## Support desk

```bash
node license_admin.mjs lookup  <cid|code>            # what it is, where it is used, when its licence ends
node license_admin.mjs reset   <cid|code> [device]   # free one device slot, or all of them
node license_admin.mjs disable <cid|code>            # stop it being redeemed on anything new
node license_admin.mjs enable  <cid|code>
node license_admin.mjs upload  <batch.csv>           # re-register a batch whose upload failed
```

Prefer the `cid` — it is the short reference in the batch CSV and in the token, it is not a secret,
and it can safely go in an email thread. A full code works too and is hashed locally.

**"I bought a new tablet"** is `reset`. With no device id it frees every slot on the code, and the
parent enters the same code again on the devices they still have. The licence keeps its end date. To
find a device id, ask them to open the app's console and run `__playGoo.deviceId()`;
`__playGoo.endsAt()` shows the date that tablet's licence runs to.

**`disable` is not revocation.** It stops the code being redeemed on anything new; tablets already
activated verify their token offline and keep working until its end date.

**"Coś poszło nie tak po naszej stronie" for a code that exists.** Look at the latest activations
before anything else:

```bash
npx wrangler d1 execute nauka-liter-licences --remote --command "SELECT substr(device_id,1,8) AS device, datetime(activated_at,'unixepoch') AS at FROM activations ORDER BY activated_at DESC LIMIT 5"
```

A fresh row at that moment means the Worker issued a licence and the page rejected it: the page is
running a build whose public key does not match, almost always a cached older build after the keys
changed. Ctrl+Shift+R, or a fresh browser profile, fixes it. No row means the Worker itself failed —
watch `npx wrangler tail` while the parent tries again.

## Local development

```bash
# .dev.vars holds the local copies of the secrets (gitignored)
printf 'LICENSE_PRIVATE_KEY=<base64 pkcs8>\nADMIN_TOKEN=test-admin-token\n' > .dev.vars
npm run schema:local
npx wrangler dev --port 8788 --var "ALLOWED_ORIGIN:*"
```

`--var "ALLOWED_ORIGIN:*"` overrides the live origin from `wrangler.toml`, so a build served from
`localhost` can activate against it. Local D1 does not use `database_id`. A build pointed at this
Worker is not for customers, and `vite build` refuses a `localhost` activation URL unless
`ALLOW_TEST_BUILD=1` is set.

Then, from the repo root in another terminal:

```bash
LICENSE_PUBLIC_KEY=<the matching spki key> node license_check.mjs
```

That exercises the whole thing against a real Worker and a real database: the device limit, token
signatures, cross-device rejection, re-activation not spending a slot, licence length (a year from
first activation, the same end date for a later device, a reset not restarting it), the support
endpoints, and the rate limiter. It writes to whatever database it points at and deliberately trips
the limiter at the end, so it refuses a non-localhost URL without `--i-know-this-is-production`.

If the port is busy after a killed run, look for orphaned `workerd` processes — they outlive
`wrangler dev` and will happily keep answering on 8788 from a stale build.

## Endpoints

| Path | Auth | Purpose |
| --- | --- | --- |
| `POST /activate` | none | `{ code, deviceId }` → `{ token }`. The only one the app calls. |
| `POST /admin/codes` | bearer | Register a batch of code hashes. |
| `POST /admin/lookup` | bearer | Status, activations, first use and licence end for one `cid`. |
| `POST /admin/reset` | bearer | Free one device slot, or all of them. |
| `POST /admin/disable` | bearer | Switch a code off or back on. |

Failure reasons `/activate` returns: `bad-request`, `unknown-code`, `code-disabled`, `code-expired`,
`device-limit`, `rate-limited`, `server-error`. **Each one needs a Polish sentence in
`src/components/ActivationScreen.jsx`** — a reason with no sentence falls back to the generic
"something went wrong", which tells a parent nothing.
