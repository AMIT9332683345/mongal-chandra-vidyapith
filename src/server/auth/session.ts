import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import type { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/server/config/env";
import {
  findDoc,
  findDocById,
  findDocs,
  insertDoc,
  updateDocs,
  updateOneDoc,
} from "@/server/db/mongo/repository";
import { hasPermission } from "./permissions";

/**
 * Sessions and the authenticated principal.
 *
 * The cookie holds 32 random bytes. The database holds only their SHA-256 hash,
 * so reading the table does not hand an attacker a usable cookie. Sessions are
 * sliding but capped: activity extends the idle window, `absoluteExpiresAt`
 * does not move, so a stolen cookie still dies.
 *
 * Everything here is server-only. `getCurrentPrincipal` is wrapped in React's
 * `cache`, so a page and its child components resolve the same session with one
 * database round-trip.
 */

export const SESSION_COOKIE = "mcv_session";
export const CSRF_COOKIE = "mcv_csrf";

const TOKEN_BYTES = 32;

export type Principal = {
  userId: string;
  email: string;
  displayName: string;
  mustChangePassword: boolean;
  /** Role keys held by this account. */
  roleKeys: string[];
  /** Grant patterns, including any wildcards, straight from the role table. */
  grants: string[];
  /** Database row behind the current cookie, used for CSRF and revocation. */
  sessionId: string;
};

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * One-way, salted digest of an IP address for the abuse counters.
 *
 * The raw address is never stored. The salt comes from `IP_HASH_SECRET` rather
 * than from this process's memory, because the limits are counted in the
 * database across every instance and every cold start: with a per-process salt,
 * each new container would hash the same address differently and a scripted
 * client would find its throttle reset on the next request.
 */
export function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return createHmac("sha256", env.IP_HASH_SECRET).update(ip).digest("hex").slice(0, 32);
}

export function clientIp(headers: Headers): string | undefined {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || undefined;
  return headers.get("x-real-ip") ?? undefined;
}

/* -------------------------------------------------------------------------- */
/* Cookie management                                                           */
/* -------------------------------------------------------------------------- */

async function cookieJar() {
  return cookies();
}

function baseCookie() {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: env.isProduction,
  };
}

export async function setSessionCookies(token: string, csrfToken: string, expiresAt: Date) {
  const jar = await cookieJar();
  jar.set(SESSION_COOKIE, token, {
    ...baseCookie(),
    httpOnly: true,
    expires: expiresAt,
  });
  // Readable by script on purpose: the client must echo it back in a header.
  // It grants nothing by itself, which is what makes the double-submit check work.
  jar.set(CSRF_COOKIE, csrfToken, {
    ...baseCookie(),
    httpOnly: false,
    expires: expiresAt,
  });
}

export async function clearSessionCookies() {
  const jar = await cookieJar();
  const past = new Date(0);
  jar.set(SESSION_COOKIE, "", { ...baseCookie(), httpOnly: true, expires: past });
  jar.set(CSRF_COOKIE, "", { ...baseCookie(), httpOnly: false, expires: past });
}

/**
 * The same two cookies written onto a response instead of the request jar.
 *
 * A route handler that has just rotated a session can hand back the new cookie
 * with its answer; it is the same attributes, applied where the caller already
 * holds a response.
 */
export function applySessionCookies<T extends NextResponse>(
  response: T,
  session: { token: string; csrfToken: string; expiresAt: Date },
): T {
  response.cookies.set(SESSION_COOKIE, session.token, {
    ...baseCookie(),
    httpOnly: true,
    expires: session.expiresAt,
  });
  response.cookies.set(CSRF_COOKIE, session.csrfToken, {
    ...baseCookie(),
    httpOnly: false,
    expires: session.expiresAt,
  });
  return response;
}

/** The session cookie a request carries, without going through the React store. */
export function sessionTokenFromRequest(request: Request): string | undefined {
  return readCookie(request.headers.get("cookie"), SESSION_COOKIE) ?? undefined;
}

/* -------------------------------------------------------------------------- */
/* CSRF                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A CSRF token is an HMAC of the session id under a server-only secret.
 *
 * It is stateless, cannot be forged without the secret, and is bound to one
 * session, so a token captured for another account does not validate.
 */
export function makeCsrfToken(sessionId: string): string {
  return createHmac("sha256", env.CSRF_SECRET).update(sessionId).digest("base64url");
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifies the header/body token against the one derived from the live session.
 * Called by every state-changing route handler before it does any work.
 */
export async function verifyRequestCsrf(request: Request, sessionId: string): Promise<boolean> {
  const supplied =
    request.headers.get("x-csrf-token") ??
    (await readFormValue(request, "csrfToken"));
  if (!supplied) return false;
  return constantTimeEquals(supplied, makeCsrfToken(sessionId));
}

/**
 * Reads one field from a form or JSON body without consuming it for the caller.
 * Only small bodies are inspected; a large upload is not buffered to find a token.
 */
async function readFormValue(request: Request, field: string): Promise<string | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) return null;
  try {
    const text = await request.clone().text();
    return new URLSearchParams(text).get(field);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Anonymous form tokens                                                       */
/* -------------------------------------------------------------------------- */

export const FORM_TOKEN_COOKIE = "mcv_form_token";
/** Header the middleware uses to hand the freshly minted token to the render. */
export const FORM_TOKEN_HEADER = "x-mcv-form-token";

/**
 * A signed value the visitor's browser holds, echoed back in the form body.
 *
 * The public forms — admission applications, enquiries, sign-in — are reached by
 * people with no session, so the session-bound token above does not apply. This
 * is the double-submit pattern: an attacker's site can make a browser send the
 * cookie, but cannot read it to reproduce the body field, and cannot forge the
 * signature without the server secret. It expires with the form's useful life.
 */
export function issueFormToken(ttlMinutes = 120): string {
  const payload = `${Date.now() + ttlMinutes * 60_000}.${randomBytes(12).toString("base64url")}`;
  const signature = createHmac("sha256", env.CSRF_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyFormToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expiresRaw, nonce, signature] = parts as [string, string, string];
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = createHmac("sha256", env.CSRF_SECRET)
    .update(`${expiresRaw}.${nonce}`)
    .digest("base64url");
  return constantTimeEquals(expected, signature);
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

/** The cookie the browser sends, read without consuming the request body. */
export function formTokenFromRequest(request: Request): string | null {
  return readCookie(request.headers.get("cookie"), FORM_TOKEN_COOKIE);
}

/* -------------------------------------------------------------------------- */
/* Session lifecycle                                                           */
/* -------------------------------------------------------------------------- */

export async function createSession(
  userId: string,
  meta: { ipHash: string | null; userAgent: string | null },
): Promise<{ token: string; csrfToken: string; sessionId: string; expiresAt: Date }> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const now = Date.now();
  const ttlMs = env.SESSION_TTL_HOURS * 60 * 60 * 1000;
  const expiresAt = new Date(now + ttlMs);
  // An active account is never logged out abruptly, but a cookie cannot live
  // beyond 30 days no matter how much it is used.
  const absoluteExpiresAt = new Date(now + Math.max(ttlMs, 30 * 24 * 60 * 60 * 1000));

  const row = await insertDoc("sessions", {
    tokenHash: hashToken(token),
    userId,
    expiresAt,
    absoluteExpiresAt,
    ipHash: meta.ipHash,
    userAgent: meta.userAgent,
  });

  return { token, csrfToken: makeCsrfToken(row.id), sessionId: row.id, expiresAt };
}

export async function revokeSession(sessionId: string, reason: string): Promise<void> {
  await updateOneDoc(
    "sessions",
    { id: sessionId, revokedAt: null },
    { revokedAt: new Date(), revokeReason: reason },
  );
}

export async function revokeAllSessions(userId: string, reason: string): Promise<void> {
  await updateDocs(
    "sessions",
    { userId, revokedAt: null },
    { revokedAt: new Date(), revokeReason: reason },
  );
}

/**
 * The principal behind a session token, or null.
 *
 * Resolves session → user → roles → permission patterns in one query set, and
 * rejects anything revoked, expired, or belonging to a deactivated account.
 * Kept apart from `getCurrentPrincipal` so a route handler that already holds
 * the raw cookie — and a test — use exactly the same rules.
 */
export async function resolvePrincipal(token: string | undefined): Promise<Principal | null> {
  if (!token) return null;

  const session = await findDoc(
    "sessions",
    { tokenHash: hashToken(token), revokedAt: null },
    { projection: { userId: 1, expiresAt: 1, absoluteExpiresAt: 1, lastSeenAt: 1 } },
  );
  if (!session) return null;

  const account = await findDocById("users", session.userId);
  if (!account) return null;

  const row = {
    sessionId: session.id,
    userId: session.userId,
    sessionExpiresAt: session.expiresAt,
    sessionAbsoluteExpiresAt: session.absoluteExpiresAt,
    sessionLastSeenAt: session.lastSeenAt ?? null,
    email: account.email,
    displayName: account.displayName,
    status: account.status,
    mustChangePassword: account.mustChangePassword,
  };

  const now = Date.now();
  if (
    row.sessionExpiresAt.getTime() < now ||
    row.sessionAbsoluteExpiresAt.getTime() < now ||
    row.status !== "active"
  ) {
    if (row.status !== "active") {
      await revokeSession(row.sessionId, `account_status:${row.status}`);
    }
    return null;
  }

  const grants = await loadGrants(row.userId);

  // Sliding expiry, but written only when something actually changed: either
  // the record of activity is over a minute stale, or the idle window has
  // burned a quarter of its life. Page views are read-heavy by design.
  const ttlMs = env.SESSION_TTL_HOURS * 60 * 60 * 1000;
  const remaining = row.sessionExpiresAt.getTime() - now;
  const seenStale = !row.sessionLastSeenAt || now - row.sessionLastSeenAt.getTime() > 60_000;
  if (seenStale || remaining < ttlMs * 0.25) {
    const expiresAt = remaining < ttlMs * 0.25 ? new Date(now + ttlMs) : row.sessionExpiresAt;
    await updateOneDoc(
      "sessions",
      { id: row.sessionId, revokedAt: null },
      { lastSeenAt: new Date(now), expiresAt },
    );
  }

  return {
    userId: row.userId,
    email: row.email,
    displayName: row.displayName,
    mustChangePassword: row.mustChangePassword,
    sessionId: row.sessionId,
    ...grants,
  };
}

/** `resolvePrincipal` applied to the request's own session cookie, deduplicated per render. */
export const getCurrentPrincipal = cache(async (): Promise<Principal | null> => {
  const jar = await cookieJar();
  return resolvePrincipal(jar.get(SESSION_COOKIE)?.value);
});

type Grants = { roleKeys: string[]; grants: string[] };

/** Role patterns held by an account, resolved through its active roles. */
export async function loadGrants(userId: string): Promise<Grants> {
  // Three indexed reads instead of a three-table join. The grants are what
  // every protected operation is decided on, so this has to stay readable.
  const grants = await findDocs("user_roles", { userId, active: true });
  const roleIds = [...new Set(grants.map((grant) => grant.roleId))];
  if (roleIds.length === 0) return { roleKeys: [], grants: [] };

  const roleRows = await findDocs("roles", { id: { $in: roleIds } });
  const permissionRows = await findDocs("role_permissions", { roleId: { $in: roleIds } });

  const keyByRoleId = new Map(roleRows.map((role) => [role.id, role.key]));
  const roleKeys = [...new Set(roleRows.map((role) => role.key))];

  const grantSet = new Set<string>();
  for (const roleId of roleIds) {
    // The super administrator's wildcard is derived, not stored, so it can
    // never be lost by a re-seed of the permission rows.
    if (keyByRoleId.get(roleId) === "super_admin") grantSet.add("*");
  }
  for (const permission of permissionRows) grantSet.add(permission.permissionKey);

  return { roleKeys, grants: [...grantSet] };
}

export function principalHas(principal: Principal | null, permission: string | undefined): boolean {
  if (!principal) return false;
  return hasPermission(principal.grants, permission);
}

/** Throws a structured error that route handlers turn into a 401 or 403. */
export class AuthenticationError extends Error {
  status = 401;
  constructor(message = "Sign in required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  status = 403;
  constructor(message = "You do not have permission to do that") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function requirePrincipal(): Promise<Principal> {
  const principal = await getCurrentPrincipal();
  if (!principal) throw new AuthenticationError();
  return principal;
}

export async function requirePermission(permission: string): Promise<Principal> {
  const principal = await requirePrincipal();
  if (!principalHas(principal, permission)) {
    // Log the attempt: a burst of 403s is the signal that something is wrong.
    console.warn(`[auth] denied ${permission} for user ${principal.userId}`);
    throw new AuthorizationError();
  }
  return principal;
}

/** Lists a user's live sessions for the security page of their dashboard. */
export async function listActiveSessions(userId: string) {
  const rows = await findDocs(
    "sessions",
    { userId, revokedAt: null, expiresAt: { $gt: new Date() } },
    { sort: { lastSeenAt: -1 } },
  );
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    lastSeenAt: row.lastSeenAt,
    userAgent: row.userAgent,
  }));
}
