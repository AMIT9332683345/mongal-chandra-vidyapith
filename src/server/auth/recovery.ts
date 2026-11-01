import { CASE_INSENSITIVE, findDoc, insertDoc } from "@/server/db/mongo/repository";
import { recordAudit } from "./audit";

/**
 * Forgotten usernames and passwords.
 *
 * No mail transport is assumed, so a request is written down for the school
 * office rather than a reset link being sent: the office already knows how to
 * hand a credential to the right person, and this way a missing SMTP setting
 * cannot silently strand someone.
 *
 * The page answers identically whether or not the identifier matches an
 * account. The matching happens here, server-side, and the result is visible
 * only to an administrator holding `user.view`.
 */

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type RecoveryRequestInput = {
  identifier: string;
  ipHash: string;
  userAgent: string;
};

export type RecoveryRequestResult = {
  id: string;
  /** For the server's own logging; never returned to the visitor. */
  matched: boolean;
};

export async function requestAccountRecovery(input: RecoveryRequestInput): Promise<RecoveryRequestResult> {
  const identifier = input.identifier.trim().slice(0, 200);
  const emailLike = EMAIL.test(identifier);
  const emailNormalized = emailLike ? identifier.toLowerCase() : null;

  const account = await findDoc(
    "users",
    emailNormalized ? { email: emailNormalized } : { displayName: identifier },
    { collation: CASE_INSENSITIVE, projection: { id: 1 } },
  );

  const row = await insertDoc("account_recovery_requests", {
    identifier,
    emailNormalized,
    matchedUserId: account?.id ?? null,
    kind: "either",
    status: "open",
    requestIpHash: input.ipHash,
    userAgent: input.userAgent.slice(0, 300),
  });

  await recordAudit({
    actorUserId: null,
    action: "auth.recovery_requested",
    resourceType: "account_recovery_request",
    resourceId: row.id,
    // The identifier is kept on the request row, where the office needs it; the
    // audit trail records only that a request arrived.
    summary: "An account recovery request was submitted",
    ipHash: input.ipHash,
    userAgent: input.userAgent,
  });

  return { id: row.id, matched: Boolean(account) };
}
