# HTTP API

Every endpoint lives under `/api` in the Next.js App Router
(`src/app/api/**/route.ts`) and runs on the Node.js runtime, because each one
touches MongoDB or `node:crypto`, and GridFS for file bytes. There is no second
API layer to keep in sync.

`/api/**` is disallowed in `robots.txt`, is absent from the sitemap, and is
never reachable with a predictable identifier for a private record.

## Conventions

**Response envelope.** Success: `{ "ok": true, ...fields }`. Failure:

```json
{ "ok": false, "error": { "code": "validation_failed", "message": "…", "fields": { "email": ["…"] } } }
```

`message` is written for a person and never echoes submitted text; `fields` keys
are form field names, which the client paints beside the inputs. Anything
unexpected inside a handler is logged server-side and answered as
`500 server_error` with a generic message — no stack trace, driver message or
column name leaves the server.

**Progressive enhancement.** The public forms and the password form are plain
HTML `<form method="post">` first. A handler tells the two apart by `Accept`:
`text/html` (a browser form post) gets a **303** redirect back to the page it
came from with a fixed `?form_error=<code>` — only internal codes travel that
way — while `application/json` gets the envelope above. `POST /api/auth/session`
is JSON-body only, since it is reached by the sign-in script.

**Security token on public forms.** `src/proxy.ts` mints a signed token
(`expiry.nonce.HMAC` under `CSRF_SECRET`) into the `mcv_form_token` cookie on
non-API page requests and hands the same value to the render through the
`x-mcv-form-token` header. The page embeds it as the hidden field `csrfToken`;
the handler requires the cookie and the field to match and to verify. Every
public form also carries a hidden `website` field — a honeypot; filled in, the
submission is refused as `spam_detected`.

**Security token on authenticated forms.** A session-bound token,
`HMAC(CSRF_SECRET, sessionId)`, is rendered into the form as `csrfToken` and
compared against the session the server resolved. It cannot be forged without
the secret and does not travel between sessions.

**Client address.** Taken from `X-Forwarded-For` (first hop) or `X-Real-IP`,
hashed with a per-process salt before it reaches the database. Raw addresses are
never stored.

**Rate limits are durable.** They count audit rows in MongoDB by
action + hashed address + window, so they hold across instances and cold starts.
A refused submission is still counted, so hammering an invalid form is not
cheaper than filling it in. Every `429` carries `Retry-After` in seconds.

## Public endpoints

### `POST /api/enquiries`

Contact and admission enquiry desk. `multipart/form-data`.

| Field | Rules |
| --- | --- |
| `csrfToken` | must match the `mcv_form_token` cookie |
| `website` | honeypot, leave empty |
| `kind` | `general` \| `admission` \| `transport` \| `feedback` \| `media` (default `general`) |
| `name` | 2–120, required |
| `email` | valid address, required |
| `phone` | optional; `+91 98765 43210` style, validated only when present |
| `subject` | optional, ≤160 |
| `message` | 20–4000, required |
| `sourcePage` | optional, ≤120 |

`200` `{ enquiryId, acknowledgementEmailQueued }`. That last field is honest:
it is `false` until SMTP is configured, and no mail is ever claimed as sent.
Limit: **5 per address per hour**. Errors: `403 csrf_failed`,
`400 spam_detected`, `422 validation_failed`, `429 rate_limited`.

### `POST /api/applications`

Admission application with proof documents. `multipart/form-data`; the fields are
the applicant, guardian, address and consent set defined by `applicationSchema`
in `src/server/admissions/service.ts`, plus:

| Field | Notes |
| --- | --- |
| `applyingClassId` | UUID of an **active** class, required |
| `documents` | repeated file parts (≤ `MAX_UPLOAD_BYTES` each) |
| `documentTypes` | repeated strings, positionally paired with `documents` |
| `declarationAccepted` | must be ticked; a checkbox posts `on` or nothing |
| `photoConsent` | `granted` \| `withdrawn` \| `pending` \| `not_required`, default `pending` |

`200` `{ referenceNumber, submittedAt, applyingClassName, documentCount }`. The
reference is `MCV-<year>-<6 characters>` drawn from an alphabet with no `0/O/1/I`
— `MCV-2026-QK4XZ7` — and is the only handle returned: no application id, no
storage key. Files are stored **restricted**: random 32-byte keys, magic-byte
validated, and never served to a reader who presents only the reference. Errors:
`422 class_not_open` when the class is not active, `422 validation_failed`,
`403`, `400`, `429`. A second application that shares a birthday and name, a
birthday alone, a guardian phone or a guardian email with an existing one is
recorded as a flagged duplicate for the office to read — with `matched_on`
saying which of those it was — rather than silently merged.
Limit: **3 per address per 12 hours**.

### `POST /api/applications/status`

Progress check for one application. `multipart/form-data` with `referenceNumber`
(6–40, `[A-Za-z0-9-]`) and `dateOfBirth` (`YYYY-MM-DD`). Both are required:
the lookup is a SHA-256 of the pair, so a correct reference with the wrong date
answers the same way an unknown reference does — `404 not_found` with a message
that does not say which half failed. `200` returns the status row only (stage,
dates, outstanding actions — never documents or private notes). Every lookup,
found or not, is counted. Limit: **10 per address per 30 minutes**.

### `GET /api/images/{documentId}` · `GET /api/downloads/{documentId}`

Serves one stored file: inline for a published gallery photograph,
`attachment` for a published document, with a sanitised download name derived
from the original filename (basename only, restricted character set). The
visibility decision lives in `serveStoredFile`, not in the route, so neither
endpoint can be talked into releasing a restricted, private, deleted or
draft-owned file: all of those answer the **same `404`** as an unknown or
malformed id, and the id is checked before any file read, so the endpoints do
not enumerate records. Responses carry `X-Content-Type-Options: nosniff` and a
`Content-Type` derived from the stored bytes, never from a client-supplied
filename. A file whose bytes no longer match the recorded size answers `503`
rather than serving something unverified.

### `GET /api/health`

Answers `200 {"ok":true}` when a `ping` to MongoDB succeeds and `503
{"ok":false}` when it does not, with `Cache-Control: no-store`. It is what
Render's health check probes, so it touches the database rather than reporting
only that the process is alive. The body carries no error text: the URL is
public, and a driver message can name an internal host.

### `POST /api/auth/recovery`

The public "forgot username or password" form. `multipart/form-data` with
`identifier` (3–200 characters: an email address or the name the account is
under) and the anonymous form token (`csrfToken` field or `x-form-token`
header). The request is written to `account_recovery_requests` either way and
the answer is identical — `303 /forgot?form_status=sent` with
`{ received: true }` for a browser, `200` JSON otherwise — so the form cannot
be used to discover which addresses or names have accounts. Only an
administrator reading the Users panel learns whether a row matched. Missing
token `403`, blank or short identifier `422`, limit **5 per address per hour**,
honeypot ignored as on every public form.

## Authenticated endpoints

### `POST /api/auth/session`

JSON `{ email, password, next? }`. On success sets `mcv_session` (HttpOnly,
SameSite Lax, `Secure` in production, expiry = the session's idle window) and
`mcv_csrf` (script-readable, by design, for the double-submit header), then
returns `{ user: { id, name, email, mustChangePassword }, csrfToken, redirectTo }`.

`redirectTo` is `/teacher` for an account holding the `teacher` role and
`/portal` for everyone else. A `next` value is honoured only when it is a path
on this site (`/…`, not `//…` or `/\…`), so a crafted link cannot bounce a
freshly signed-in browser to another domain.

Failures are deliberately indistinguishable: unknown address, wrong password and
inactive account all answer `401 invalid_credentials` with the same sentence, and
a scrypt comparison runs even against an unknown address so response time does
not enumerate staff. Two independent defences apply before that: per-account
lockout after `LOGIN_MAX_ATTEMPTS` failures, and a per-address throttle. Either
way the answer is `429` with `Retry-After` and code `try_later`. A locked account
presenting the **right** password is still refused.

### `DELETE /api/auth/session`

Signs out: revokes the session row behind the current cookie, clears both
cookies, records `auth.sign_out`. Idempotent — an absent or already-revoked
cookie still answers `{ signedOut: true }`.

### `POST /api/auth/password`

A signed-in account changing its own password. `multipart/form-data`:

| Field | Notes |
| --- | --- |
| `mcv_session` cookie | must resolve to a live session of an **active** account |
| `csrfToken` | the session-bound token rendered into the form |
| `currentPassword` | always required — an issued one-time password is not a bypass |
| `newPassword` | must pass the strength rule and differ from the current one |
| `confirmPassword` | must equal `newPassword` |

Checks run cheapest-first — session, token, shape, throttle — and only then the
scrypt comparison, which is the one an attacker can make expensive.

`200` `{ changed: true, mustChangePassword: false }` with a **fresh** session
cookie on the response; every other session for the account is revoked first, so
changing a password signs the phone and the borrowed laptop out. `401
invalid_credentials` for a wrong current password (`That password is not
correct.` — nothing about whether the account exists), `422 validation_failed`
with field errors for weak, unchanged, mismatched or blank input, `403
csrf_failed`, `401 unauthenticated`, `429` after **8 refused attempts per
address per 15 minutes**. Both the refusal (`auth.password_change_failed`) and
the change (`auth.password_changed`) are audited; the plaintext appears in no
column, no audit field and no response.

### `POST /api/auth/account`

A signed-in account changing its **sign-in address**. `multipart/form-data`:

| Field | Notes |
| --- | --- |
| `mcv_session` cookie | must resolve to a live session of an **active** account |
| `csrfToken` | the session-bound token rendered into `/portal/account` |
| `currentPassword` | required — an unattended browser must not move an account |
| `newEmail` | lowercased and trimmed; must be valid and unused |

`200` `{ emailChanged: true, email }` with a **fresh** session cookie after
every other session for the account has been revoked (`email_changed`), so the
old address cannot keep a browser signed in. `401 invalid_credentials` for a
wrong current password (audited as `auth.email_change_failed`), `422
validation_failed` for an invalid, unchanged or already-used address — the
unique index decides the race if two requests pass the check together — `403
csrf_failed`, `401 unauthenticated`, `429` after **8 refused attempts per
address per 15 minutes**. The change is audited as `auth.email_changed`; the
password never appears in the audit row or the response.

## What is deliberately absent

No content-administration, user-administration, attendance, marks, fee or
library endpoints exist yet. Those belong to the role dashboards, and when they
land each one is required to enforce its permission server-side — the catalogue,
the grant resolution and `requirePermission()` are already built and tested, and
`/portal` demonstrates the pattern.
