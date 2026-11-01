# Mongal Chandra Vidyapith — school website and management platform

A public school website and the authenticated platform behind it, for Mongal
Chandra Vidyapith. Content lives in MongoDB Atlas and is edited by the school;
the code ships no invented facts about the school.

**Current state — what is actually built and verified, and what is not:**

| Area | State |
| --- | --- |
| Public website (home, about, academics, admissions, staff, notices, events, gallery, facilities, results, downloads, contact, privacy, accessibility, CMS pages) | Built, server-rendered from the database, tested |
| Design system in the bdmi.org mould — navy topbar, sticky nav, hero, ticker, stat band, gallery, FAQ, floating contact bar, light/dark themes | Built, tested |
| Real campus photograph integration | Built — see *Photograph* below |
| MongoDB schema (95 collections, `$jsonSchema` validators, indexes), converge-on-run setup, seed data | Built, applied to a real server, tested |
| Authentication, sessions, CSRF, rate limiting, audit trail | Built, tested |
| Roles and permission enforcement (11 roles, 142 permissions, grants resolved server-side) | Built, tested |
| Public forms: contact enquiry, admission application with document upload, application status lookup | Built, tested |
| File storage in Atlas GridFS with visibility-checked serving | Built, tested |
| **Content panel** — homepage sections, school settings, notices, events, photo albums, downloads, CMS pages, FAQs, testimonials, achievements, audit log | Built, verified in a browser |
| **Admissions panel** — applications list and file view, status decisions, enquiries with replies | Built, verified in a browser |
| **Users and roles panel** — create accounts, one-time passwords, edit an account's sign-in address, reset a password, suspend/reactivate, assign roles, and work the forgotten-credential queue | Built, verified in a browser |
| **Self-service account settings** at `/portal/account` — change your own sign-in address and password; both require the current password and replace every session | Built, tested |
| **Forgotten username/password** — public form at `/forgot`, answered identically whether or not an account matches; the office resolves it from the Users panel | Built, tested |
| **Teacher dashboard** at `/teacher`, signed in at `/teacher/signin` | Built, verified in a browser |
| **Staff-only notices** — a notice can be addressed to teachers, all staff, or the public; staff-only notices never appear on the website | Built, tested |
| SEO layer: metadata, Open Graph, JSON-LD, sitemap, robots, 404 | Built, tested |
| **Attendance, marks, fees and library screens** | **Not built.** The permissions they will run on are; the screens are the next phase |
| **Notification delivery (email/SMS)** | **Not configured.** No provider credentials exist yet, so nothing claims a message was sent |
| **Online fee payment** | **Not configured.** No provider is wired; fees are not collectable through the site |
| **Independent security review** | **Not performed.** Do not treat this project as audited |

The portal at `/portal` resolves the signed-in person's role and permissions and
shows only the rooms that role opens, so a teacher never sees an accounts
screen even as a disabled link. A teacher who signs in at `/signin` or
`/teacher/signin` lands on `/teacher` instead, where the notices addressed to
teachers are listed; everything else in the portal stays behind its permission.

---

## Requirements

- Node.js 20.9 or newer (Next 16, `tsx` scripts, GridFS)
- A MongoDB 6+ server for the application database. `npm run db:start` runs a
  real single-node replica set on port **27017** from the binary shipped by
  `mongodb-memory-server`, with its data in `.mongo-data/`; MongoDB Atlas works
  identically and is what production uses.

## Quick start

```bash
npm install
cp .env.example .env.local          # then fill in the two secrets
npm run db:start                    # local MongoDB on 27017 (skip if using Atlas)
npm run db:migrate                  # collections, validators and indexes
npm run db:seed                     # roles, permissions, academic year, labelled content slots
npm run setup:admin -- --email "office@example.org" --name "Office Administrator"
npm run dev                         # http://localhost:3000
```

Generate the secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`.env.example` documents every variable. Outside production the app falls back
to fixed, loudly-warned development secrets so `npm run dev` works without a
prepared `.env.local`; **in production it refuses to boot unless
`CSRF_SECRET` and `IP_HASH_SECRET` are set** (and `MONGODB_URI` is present
always).

## Configuration

| Variable | Purpose | Notes |
| --- | --- | --- |
| `APP_URL` | Public origin | Canonical URLs, JSON-LD, sitemap, redirect targets |
| `SITE_ROLE` | `site` \| `portal` | A portal deployment does not let crawlers index its copy of the public pages |
| `MONGODB_URI` | MongoDB connection string | Required. The Atlas SRV string in production |
| `MONGODB_DATABASE` | Database name | Keep staging and production apart; uploads live in it too |
| `CSRF_SECRET` | ≥32 chars | Derives CSRF tokens and anonymous form tokens |
| `IP_HASH_SECRET` | ≥32 chars, different from the above | Salt for the one-way digest of a client address; every instance must share it or the durable rate limits fragment |
| `SESSION_TTL_HOURS` | Idle window, default 12 | Sessions also die at an absolute 30-day cap |
| `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCKOUT_MINUTES` | Sign-in abuse rules | Defaults 5 / 15 |
| `MAX_UPLOAD_BYTES` | Per-file ceiling, default 10 MB | Enforced before the bytes reach GridFS |
| `NEXT_PUBLIC_PORTAL_ORIGIN` | Portal's origin | Only when the public site and portal are separate deployments; empty means same origin |
| `SMTP_*`, `MAIL_FROM` | Optional mail | While blank, the app reports "not sent" instead of pretending |
| `PAYMENT_*` | Optional fee collection | While blank, payments are disabled |

No secret is committed. `.env`, `.env.local`, `.mongo-data/` and `uploads/` are
all in `.gitignore`.

## The database

MongoDB has no ordered migration history, so the schema is a convergence step
rather than a replay. `src/server/db/mongo/ensure-schema.ts` declares every
collection's `$jsonSchema` validator and indexes; `npm run db:migrate` makes the
live database match, which leaves a brand-new cluster and one running for months
identical. The declarations live beside the code that queries them in
`schema.generated.ts`, and `constraints.ts` carries the rules a validator cannot
express.

Uploaded files go to GridFS in the same database (`uploads` bucket), so an
upload and the record describing it succeed or fail together, a database backup
includes the documents, and neither Vercel nor Render needs a writable disk.

Other commands:

```bash
npm run db:seed       # idempotent reference data (roles, permissions, years, content slots)
npm run db:reset -- --yes   # DESTROYS DATA: development and CI only, refused in production
npm run db:smoke      # round-trip check against the configured server
npm run db:uploads    # move legacy disk uploads into GridFS
npm run db:stop
```

`npm run db:seed` writes **no fact about the school and no user account**. Every
school-owned field it creates is an explicitly unconfirmed placeholder, which the
site renders as a labelled gap rather than an invented sentence.

## Creating the first administrator

```bash
npm run setup:admin -- --email "you@example.org" --name "Your Name"
# optional: --role school_admin  --password "something private"
```

There is no default password anywhere in this system. Without `--password` the
script generates a strong one, prints it **once**, and sets
`mustChangePassword` so the portal asks the holder to replace it. Changing a
password requires the current one, enforces the strength rule, revokes every
other session for that account, and writes an audit entry. After the first
account exists, the portal's **Users** page does the rest.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Development server on 3000 |
| `npm run build` | Production build (requires real secrets in the environment) |
| `npm run start` | Serve the built app on `PORT` (default 3000) |
| `npm run typecheck` | `tsc --noEmit` across `src` and `tests` |
| `npm test` | The whole suite against a real throwaway database |
| `npm run test:watch` | Watch mode |

A production build needs the secrets present because the environment parser
refuses `DEV_ONLY_SECRET` when `NODE_ENV=production`:

```bash
CSRF_SECRET=… IP_HASH_SECRET=… MONGODB_URI=… npm run build
```

## Deployment

Vercel runs the public site, Render runs the portal, and both use one MongoDB
Atlas cluster. `vercel.json` and `render.yaml` are committed, and
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) walks through the network access, the
environment variables, the first administrator and the checks that prove the
deployment works. The whole platform also runs on a single host with
`NEXT_PUBLIC_PORTAL_ORIGIN` left empty.

## Tests

```bash
npm test
```

`tests/global-setup.ts` drops and rebuilds a real database (`mcv_test`), applies
the schema and seeds reference data through the same code path `npm run db:seed`
uses. Files run sequentially against it, because the point is to exercise the
actual server rather than a mock of it — that is how four production defects (an
optional-field schema that rejected every blank-phone enquiry, WebP magic-byte
offsets, a `Content-Disposition` path traversal, a missing `Retry-After`) were
found.

| Suite | Covers |
| --- | --- |
| `tests/auth.test.ts` | scrypt storage and re-hash, password strength, sign-in (unknown address and wrong password answer identically, lockout, inactive accounts), session hashing, CSRF binding to one session, revocation, role grant resolution, super-admin wildcard, row-level scope for guardian/pupil/teacher/librarian/admin, durability across a brand-new connection, database-level validation |
| `tests/password-change.test.ts` | Unauthenticated and revoked sessions, suspended accounts, missing/foreign CSRF token, no-JS redirect, wrong current password, weak and unchanged replacements, throttle at 8 failures per address, session rotation, audit entries, and that the plaintext never reaches a stored field |
| `tests/account-recovery.test.ts` | Self-service email change (wrong password, invalid, unchanged, address in use, case handling, suspended account), the forgotten-credential queue (matched and unmatched identifiers answer alike, one-time password works, sessions revoked, double-close refused), office edits of another account, teacher-only notice visibility, both recovery routes, the sign-in landing rule (`/teacher` for teachers, same-site `next` honoured, off-site refused), and revoked sessions |
| `tests/public-forms.test.ts` | Contact, application and status-lookup routes as real `Request` objects: form token, honeypot, rate limits, field errors, reference-number format, restricted document storage, closed-class rejection, duplicate flagging, two-factor status lookup, durability |
| `tests/public-content.test.ts` | Notice/page/document visibility, confirmed-content gates, gallery consent, staff directory privacy, document listings that never return a storage key |
| `tests/file-serving.test.ts` | Magic-byte detection, extension mismatch, size ceiling, random unguessable keys, safe download names, and that restricted/private/deleted/malformed ids all answer the same 404 |
| `tests/design-system.test.ts` | The pre-paint theme script in a `vm` (saved choice beats system, corrupt values, blocked storage), palette parity between `:root` and `.dark`, no blue-dominant colour in either theme, declared tokens vs every `var()` used, navigation targets, robots and sitemap contents, no-index pages |
| `tests/content-panel.test.ts` | The publishing path end to end: panel permission checks, form tokens, a notice from draft to board, an event on the calendar, gallery consent gating, a circular's attachments, homepage sections, unconfirmed school details, the audit trail, and an accepted upload's stored shape |

**Not covered, because it is not built:** attendance, marks, fees, library and
notification delivery. Their tests arrive with those modules.

## Design and themes

Tokens live in `src/app/globals.css`: light values in `:root`, dark values in
`.dark`, both exposed to Tailwind through `@theme inline`. Dark mode is a class
on `<html>`, never a media query the site obeys silently.

Three contact actions — **Call Now**, **WhatsApp Chat Now** and **Email Us** —
stay on screen at every width: pills fixed at the bottom right on desktop, a
three-button bar at the bottom on phones, and the same row inside the home and
contact pages. A channel the school has not confirmed keeps its button but points
at the contact form, carries a dashed outline and a dot, and says in its
accessible name that the detail is not published yet — so the control never
claims a number the school has not supplied.

`src/lib/theme.ts` holds the pre-paint script that runs before first paint. Its
rule, tested rather than asserted: an explicit saved choice always wins; the
system preference is consulted only for a visitor who has never touched the
switch; the value is remembered under `mcv-theme` and applied to every surface,
including the portal and error pages.

To add a token: declare it in `:root` **and** `.dark` — the suite fails if a
colour light mode sets has no dark counterpart, and if any hue between 190° and
280° with real saturation appears in either palette.

## Photograph

`public/images/campus.webp` is the school's own photograph — the file supplied,
re-encoded to WebP, **228 × 190 pixels**. It appears on the home page, About and
Facilities in a bordered mount at its native resolution, and as the Open Graph
image. It is not blurred, not colour-shifted, not replaced with a generated
building and not upscaled, because stretching 228 pixels across a hero is exactly
the blur the brief forbids. Gallery and staff photographs come from uploaded
files behind a consent flag; the site shows labelled placeholders rather than
invented imagery of real people.

**Known limitation, left deliberately:** a full-bleed hero needs a
higher-resolution original. Drop one into the same path, then update the
dimensions in [src/components/campus-photo.tsx](src/components/campus-photo.tsx)
and the Open Graph size in [src/lib/metadata.ts](src/lib/metadata.ts). Until
then the home page sets the photograph beside typography rather than stretching
it.

## Content the school still owes

Every one of these renders as a visible, labelled gap on the site until the
school supplies it, and each is editable in the portal — never a hardcoded
string:

establishment date and history · board and curriculum · current classes and
sections · head of school's formal message · faculty roster · confirmed
facilities · published results · notice and event archive · admission schedule
and fee structure · address, phone, email · data-protection contact ·
consent records for photographs of pupils.

## Security posture — honest version

Implemented and tested: server-side permission checks for every protected
operation (the browser is never the authority), DB-backed hashed session
tokens, HMAC session-bound CSRF tokens, signed anonymous form tokens, per-address
durable rate limits counted from audit rows, per-account lockout, scrypt
password hashing with recorded parameters, magic-byte-validated uploads under
random keys with visibility-checked serving that answers 404 for anything it
will not release, audit entries for sensitive reads and writes, no-index on
private pages, and no secret in the repository.

Not claimed: this code has **not** undergone an independent penetration test or
external audit, and has not been load-tested. `next.config.ts` sets
`X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy` and a
`Permissions-Policy` that denies camera, microphone and geolocation, and turns
off the `X-Powered-By` header — but there is **no Content-Security-Policy** yet,
because a meaningful one has to be written against the final page set rather
than guessed now. TLS, HSTS and any CSP go in at the hosting layer; mail and
payment integrations are unconfigured, so no delivery or payment success is ever
simulated. Deploy behind HTTPS, add a CSP, and get an independent review before
holding real pupil records.

## Further reading

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Vercel + Render + Atlas, step by step
- [docs/API.md](docs/API.md) — every HTTP endpoint, its guards and its responses
- [.env.example](.env.example) — the configuration template
