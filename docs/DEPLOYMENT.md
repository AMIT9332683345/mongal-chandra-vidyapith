# Deployment

The school's target is **Vercel (public site) + Render (portal) + MongoDB Atlas
(database and uploaded files)**. One repository, two deployments of the same
build, one database. Nothing in this document is a claim that the deployment is
production-secure; see *Before you put real pupil data in* at the end.

## What runs where

| Host | Role | Serves |
| --- | --- | --- |
| Vercel | Public site | Home, about, academics, admissions (form + status), notices, events, gallery, downloads, results, staff, facilities, contact, CMS pages, `/api/enquiries`, `/api/applications`, `/api/images/*`, `/api/downloads/*` |
| Render | Portal (always-on Node) | `/signin`, `/portal/**`, every panel and server action, `/api/auth/*`, `/api/portal/*` |
| Atlas | State | Every collection, the schema validators and indexes, and uploaded files in the `uploads` GridFS bucket |

Both deployments read and write the same Atlas database, so an enquiry filed on
the public site appears in the portal on Render immediately, and a notice
published in the portal appears on the Vercel site within its revalidation
window.

Sessions are cookie-bound to the host that issued them. That is why the public
site's "Sign in" and "School portal" links must point at the Render origin — set
`NEXT_PUBLIC_PORTAL_ORIGIN` on **both** deployments to the portal's public URL.
Signing in from the public origin would mint a cookie the portal host never
receives.

Uploaded documents are written to GridFS inside Atlas, not to either host's
disk, so nothing disappears when a Vercel function or a Render instance is
recycled and the two hosts share every file without an object-storage service.

**Single-deployment alternative.** The whole platform also runs on Vercel alone
(or Render alone) with `NEXT_PUBLIC_PORTAL_ORIGIN` left empty. That is the
simplest option and the correct one for a school that does not need an always-on
process.

## 1. Provision Atlas

1. Create a free cluster (M0 is enough to start) in the region nearest the
   school — Mumbai (`ap-south-1`) is the sensible choice from Kolkata.
2. **Database Access** → add a user with `readWrite` on the application
   database. Do not use the admin user.
3. **Network Access** → allow the hosts that connect. Vercel and Render do not
   publish fixed egress addresses on their free plans, so `0.0.0.0/0` is the
   working setting; the account password is then the only barrier, which is why
   it must be long and unique.
4. **Connect → Drivers** → copy the `mongodb+srv://…` string. Put the database
   name in the path (`…/mongal_chandra_vidyapith`) or rely on
   `MONGODB_DATABASE`.

One cluster can hold a staging database beside production; keep the names
distinct so a staging deploy cannot touch real records.

## 2. Vercel — the public site

Import the repository. The framework is detected from `package.json` and the
build command from `vercel.json`; no other build configuration is needed.

Environment variables (Project → Settings → Environment Variables) — **all of
them must be present for the production build**, because the environment parser
runs during page-data collection and refuses to start without them:

| Variable | Value |
| --- | --- |
| `APP_URL` | `https://the-real-origin.example`, no trailing slash |
| `SITE_ROLE` | `site` |
| `MONGODB_URI` | the Atlas SRV string |
| `MONGODB_DATABASE` | `mongal_chandra_vidyapith` |
| `CSRF_SECRET` | 64 hex characters |
| `IP_HASH_SECRET` | 64 hex characters, different from the above |
| `NEXT_PUBLIC_PORTAL_ORIGIN` | the Render URL, e.g. `https://mcv-portal.onrender.com` |
| `SESSION_TTL_HOURS` | `12` |
| `LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCKOUT_MINUTES` | `5` / `15` |
| `MAX_UPLOAD_BYTES` | `10485760` (10 MB) |
| `SMTP_*`, `MAIL_FROM` | **leave blank** until real credentials exist |
| `PAYMENT_*` | **leave blank** until a provider account exists |

Generate the two secrets once and reuse the same values on Render:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`APP_URL` and `NEXT_PUBLIC_PORTAL_ORIGIN` are read at **build** time: `robots.txt`
and `sitemap.xml` are static files that carry the origin, and `NEXT_PUBLIC_*` is
inlined into the JavaScript. Changing either needs a redeploy, not a restart.

Leaving the optional blocks blank is the correct state, not a broken one: the
application reports that mail was not sent and that payments are unavailable,
instead of simulating either.

## 3. Render — the portal

**New → Blueprint**, point it at the same repository. `render.yaml` defines the
service, the health check (`/api/health`, which pings Atlas and answers `503`
when it cannot) and the build, which is:

```
npm ci --include=dev && npm run db:migrate && npm run db:seed && npm run build
```

`db:migrate` runs `ensureSchema()`: it creates the collections, `$jsonSchema`
validators and indexes the code expects and converges an empty cluster and an
aged one to the same shape. `db:seed` writes the 11 roles, the permission
grants, the academic year and labelled content slots — reference data only, and
no fact about the school. Both are idempotent; running them on every deploy is
deliberate.

Render asks for the values marked `sync: false` in the blueprint:

| Variable | Value |
| --- | --- |
| `MONGODB_URI` | the same Atlas string |
| `APP_URL` | the **public site's** origin (Vercel) |
| `NEXT_PUBLIC_PORTAL_ORIGIN` | this service's own URL, e.g. `https://mcv-portal.onrender.com` |

`CSRF_SECRET` and `IP_HASH_SECRET` are generated by Render on the first deploy
and kept. They do not have to match Vercel's: portal forms are rendered and
posted on the portal host, so their tokens never cross origins.

The free plan spins down after inactivity, so the first sign-in after a quiet
period waits for a cold start. Nothing is lost — sessions, uploads and records
all live in Atlas. Upgrade the instance type if that wait matters.

**Order matters once:** let Render deploy first so the schema and seed exist,
then deploy Vercel. If Vercel builds first it still succeeds — the public pages
simply render labelled gaps until the collections are created.

## 4. Create the first administrator

There is no default password, because there is no default password. Run the
script from a machine that can reach Atlas (Render's shell works, or locally
with `MONGODB_URI` exported):

```bash
MONGODB_URI="mongodb+srv://…" npm run setup:admin -- \
  --email "principal@school.example" --name "The Principal" --role school_admin
```

Without `--password` it generates a strong one, prints it **once**, and marks
the account so the portal asks its holder to replace it at first sign-in. Clear
the terminal scrollback afterwards.

Grant further accounts from the same script, with the role each person actually
needs: `super_admin`, `school_admin`, `principal`, `teacher`, `student`,
`parent`, `admission_staff`, `accounts`, `librarian`, `event_coordinator`,
`office_staff`. Re-running it for an address that already exists changes
nothing. Once one administrator exists, the **Users** page in the portal does
the same job without shell access.

Never run `npm run db:reset` against a deployed database: it refuses when
`NODE_ENV=production` and drops every row when it does not.

## 5. Verify the deployment

Against the Vercel origin:

- `/` in both themes; reload after switching — the choice must survive (stored
  under `mcv-theme`, and a saved choice beats the system one).
- `/notices`, `/events`, `/gallery` render what the database holds; unconfirmed
  school facts appear as labelled gaps rather than sentences.
- Submit a contact enquiry, confirm the row in `contact_enquiries` through
  Atlas, and confirm it appears under **Enquiries** in the portal.
- Submit an admission application, keep the reference, confirm the file landed
  in the `uploads.files` collection and that `/api/portal/applications/documents/<id>`
  answers `404` without a session.
- `/api/applications/status` with the reference **and** date of birth; with only
  the reference it must answer `404`.
- `curl -s <origin>/robots.txt` and `/sitemap.xml`; neither may expose
  `/portal`, `/signin`, `/api` or an upload path.
- `/api/downloads/<random-uuid>` answers the same `404` as `/api/downloads/not-a-uuid`.

Against the Render origin:

- `/api/health` answers `200 {"ok":true}`; stop the service and it stops
  answering.
- Sign in, reach `/portal`, open one panel per role from the **Users** page's
  role table, and confirm a role without a permission does not see the link.
- Publish a notice and a CMS page; both must appear on the Vercel site after its
  revalidation window.
- Restart the Render service and sign in again — the session and every record
  must still be there.
- `/robots.txt` on the portal host must say `Disallow: /` (the deployment is
  `SITE_ROLE=portal`, so it is not indexed as a duplicate of the real site).

## 6. Continuous integration

`npm test` needs a real MongoDB: `tests/global-setup.ts` connects to the server
named by `MONGODB_URI` (default `mongodb://127.0.0.1:27017`), drops and rebuilds
the `mcv_test` database, applies `ensureSchema()`, and seeds reference data
through the same code path the CLI uses. It cannot run against a mock. The name
is refused unless it contains `test`, so a mistyped `TEST_DATABASE_NAME` cannot
empty a real database. The suite runs sequentially because the point is to
exercise the actual server rather than a mock of it.

A workflow needs Node 20 and a MongoDB service:

```yaml
services:
  mongo:
    image: mongo:7
    ports: ["27017:27017"]
```

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
- run: npm ci
- run: npm run typecheck
- run: npm test
- run: npm run build
  env:
    CSRF_SECRET: 00000000000000000000000000000000000000000000000000000000000000
    IP_HASH_SECRET: 11111111111111111111111111111111111111111111111111111111111111
    MONGODB_URI: mongodb://127.0.0.1:27017
```

The build requires the two secrets even as dummies, because a production build
refuses the development fallbacks. On a runner without a database the pages
that prerender render labelled gaps; the build still completes.

## 7. Backups and retention

Managed by the school, not by this application:

- Atlas automated backups of the application database, with a tested restore —
  an untested backup is not a backup. On M0, schedule `mongodump` yourself; the
  free tier does not include continuous backups.
- The database backup includes the uploads, because the files are GridFS
  collections in the same database. That is the practical advantage of this
  design over a separate object store, and the reason to keep the retention
  window long enough for admission records.
- `audit_logs` grows with every sensitive read; it is the record a family or an
  inspector may ask for, so it is not a collection to truncate casually.

## Before you put real pupil data in

Not done yet, and each is a gate rather than a nicety:

1. **A Content-Security-Policy** written against the real page set. The four
   security headers that exist today (`X-Content-Type-Options`,
   `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) are not a
   substitute.
2. **TLS/HSTS at both hosts**, HTTPS-only cookies (automatic in production), and
   `APP_URL` on the https origin so no mixed content appears.
3. **A restrictive Atlas network list.** `0.0.0.0/0` is what the free hosting
   plans force; a fixed-egress plan removes an entire class of exposure.
4. **An independent security review** of the authentication, permissions and
   file-visibility paths, plus a documented incident-response contact.
5. **A written photograph-consent process** for minors, with the records in the
   `consent` collections — the gallery refuses to publish an album whose consent
   is not cleared, but the school still has to collect it.
6. **Mail delivery**, if the school wants families notified. Until `SMTP_*` is
   set, the portal says mail was not sent; it never pretends.
