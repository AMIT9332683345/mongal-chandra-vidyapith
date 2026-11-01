import { CASE_INSENSITIVE, countDocs, findDoc, insertDoc, updateOneDoc } from "@/server/db/mongo/repository";
import { env } from "@/server/config/env";
import { recordAudit } from "./audit";
import { hashIp } from "./session";
import { hashPassword, needsRehash, verifyPassword } from "./passwords";

/**
 * Sign-in.
 *
 * Three separate defences, because credential stuffing does not respect one:
 *
 * - per-account lockout after `LOGIN_MAX_ATTEMPTS` failures, so one password
 *   cannot be guessed against one identity;
 * - a per-address throttle over the last lockout window, so one attacker cannot
 *   try a common password against every account in the school;
 * - no information about which half of the pair was wrong, and a real scrypt
 *   comparison even when the address is unknown, so response content and timing
 *   do not enumerate staff or pupil accounts.
 */

export const GENERIC_LOGIN_FAILURE = "Email or password is incorrect";

/** Verifies against a throwaway hash so an unknown email costs the same as a wrong password. */
const DUMMY_HASH =
  "scrypt$15$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export type LoginSubject = {
  ip?: string;
  userAgent?: string;
};

export type LoginFailureCode =
  | "invalid_credentials"
  | "account_locked"
  | "account_not_active"
  | "too_many_requests";

export type LoginOutcome =
  | { ok: true; user: { id: string; email: string; displayName: string; mustChangePassword: boolean } }
  | { ok: false; code: LoginFailureCode; message: string; retryAfterSeconds?: number };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

/**
 * Combined hash of address and user agent. Grouping them means a shared
 * classroom IP does not lock the school out on one student's miscounting,
 * while a single scripted client still hits its ceiling quickly.
 */
function subjectHash(ipHash: string | null, userAgent: string | undefined): string {
  return `${ipHash ?? "unknown-ip"}|${(userAgent ?? "unknown-agent").slice(0, 128)}`;
}

/* -------------------------------------------------------------------------- */
/* Throttle accounting                                                         */
/* -------------------------------------------------------------------------- */

async function recentFailures(subject: string, since: Date): Promise<number> {
  return countDocs("login_attempts", {
    subjectHash: subject,
    succeeded: false,
    createdAt: { $gt: since },
  });
}

async function recordAttempt(
  subject: string,
  emailNormalized: string,
  succeeded: boolean,
  failureReason: string | null,
  ipHash: string | null,
): Promise<void> {
  try {
    await insertDoc("login_attempts", {
      subjectHash: subject,
      emailNormalized,
      succeeded,
      failureReason,
      ipHash,
    });
  } catch (error) {
    // The counter table must never become the reason a valid user is locked out.
    console.error("[auth] could not record login attempt", error);
  }
}

/* -------------------------------------------------------------------------- */
/* The sign-in flow                                                            */
/* -------------------------------------------------------------------------- */

export async function authenticate(
  rawEmail: string,
  password: string,
  subject: LoginSubject = {},
): Promise<LoginOutcome> {
  const emailNormalized = normalizeEmail(rawEmail);
  const ipHash = hashIp(subject.ip);
  const subjectKey = subjectHash(ipHash, subject.userAgent);
  const windowStart = minutesFromNow(-env.LOGIN_LOCKOUT_MINUTES);

  if (!password) {
    await recordAttempt(subjectKey, emailNormalized, false, "empty_password", ipHash);
    return { ok: false, code: "invalid_credentials", message: GENERIC_LOGIN_FAILURE };
  }

  // Address-level throttle, applied before any password work.
  if ((await recentFailures(subjectKey, windowStart)) >= env.LOGIN_MAX_ATTEMPTS * 3) {
    return {
      ok: false,
      code: "too_many_requests",
      message: "Too many sign-in attempts from here. Try again later.",
      retryAfterSeconds: env.LOGIN_LOCKOUT_MINUTES * 60,
    };
  }

  // The same collation the unique index is built with, so `A@x.com` and
  // `a@x.com` are one account here and cannot both exist in the first place.
  const account = await findDoc(
    "users",
    { email: emailNormalized },
    { collation: CASE_INSENSITIVE },
  );

  const passwordMatches = await verifyPassword(password, account?.passwordHash ?? DUMMY_HASH);

  if (!account || !passwordMatches) {
    await recordAttempt(
      subjectKey,
      emailNormalized,
      false,
      account ? "bad_password" : "unknown_email",
      ipHash,
    );
    if (account) await registerFailure(account);
    await recordAudit({
      actorUserId: account?.id ?? null,
      action: "auth.sign_in_failed",
      resourceType: "user",
      resourceId: account?.id ?? null,
      summary: account ? "Incorrect password" : "Unknown sign-in address",
      ipHash,
      userAgent: subject.userAgent ?? null,
    });
    return { ok: false, code: "invalid_credentials", message: GENERIC_LOGIN_FAILURE };
  }

  // A locked account with the right password is still refused: the lockout
  // exists to slow down a successful guesser, not only a failing one.
  if (account.lockedUntil && account.lockedUntil.getTime() > Date.now()) {
    const seconds = Math.ceil((account.lockedUntil.getTime() - Date.now()) / 1000);
    await recordAttempt(subjectKey, emailNormalized, false, "locked", ipHash);
    return {
      ok: false,
      code: "account_locked",
      message: `Too many attempts. Try again in ${formatDuration(seconds)}.`,
      retryAfterSeconds: seconds,
    };
  }

  if (account.status !== "active") {
    await recordAttempt(subjectKey, emailNormalized, false, `status:${account.status}`, ipHash);
    await recordAudit({
      actorUserId: account.id,
      action: "auth.sign_in_blocked",
      resourceType: "user",
      resourceId: account.id,
      summary: `Account is ${account.status}`,
      ipHash,
      userAgent: subject.userAgent ?? null,
    });
    return {
      ok: false,
      code: "account_not_active",
      message: "This account is not active. Contact the school office.",
    };
  }

  await updateOneDoc(
    "users",
    { id: account.id },
    {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastSeenAt: new Date(),
    },
  );
  await recordAttempt(subjectKey, emailNormalized, true, null, ipHash);

  // Transparent upgrade when the stored hash predates the current parameters.
  if (needsRehash(account.passwordHash)) {
    await updateOneDoc(
      "users",
      { id: account.id },
      { passwordHash: await hashPassword(password) },
    );
  }

  await recordAudit({
    actorUserId: account.id,
    action: "auth.sign_in",
    resourceType: "user",
    resourceId: account.id,
    summary: "Signed in",
    ipHash,
    userAgent: subject.userAgent ?? null,
  });

  return {
    ok: true,
    user: {
      id: account.id,
      email: account.email,
      displayName: account.displayName,
      mustChangePassword: account.mustChangePassword ?? false,
    },
  };
}

/** Raises the per-account failure counter and applies the lockout at the limit. */
async function registerFailure(account: {
  id: string;
  failedLoginAttempts?: number;
  lockedUntil?: Date | null;
}): Promise<void> {
  // The count restarts only once a previous lockout has actually expired;
  // an account that has never been locked keeps counting from its first miss.
  const lockExpired = !!account.lockedUntil && account.lockedUntil.getTime() <= Date.now();
  const previous = lockExpired ? 0 : (account.failedLoginAttempts ?? 0);
  const next = previous + 1;

  const patch: Record<string, unknown> = {
    failedLoginAttempts: next,
    lockedUntil: null,
  };
  if (next >= env.LOGIN_MAX_ATTEMPTS) {
    patch.lockedUntil = minutesFromNow(env.LOGIN_LOCKOUT_MINUTES);
    patch.failedLoginAttempts = 0;
  }

  await updateOneDoc("users", { id: account.id }, patch);
}

function formatDuration(seconds: number): string {
  if (seconds >= 3600) return `${Math.ceil(seconds / 3600)} hours`;
  if (seconds >= 60) return `${Math.ceil(seconds / 60)} minutes`;
  return `${seconds} seconds`;
}
