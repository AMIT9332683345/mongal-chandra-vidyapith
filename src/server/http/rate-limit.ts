import { countDocs } from "@/server/db/mongo/repository";
import { recordAudit } from "@/server/auth/audit";

/**
 * Submissions are limited by counting what the database already recorded, not
 * by a counter in this process's memory. On a platform that runs several
 * instances — which is how this app is deployed — an in-memory bucket would
 * reset on every cold start and would be invisible to the other instances.
 */
export class RateLimitedError extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(`Too many submissions from this address. Try again in ${retryAfterSeconds} seconds.`);
    this.name = "RateLimitedError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function assertRateLimit(input: {
  action: string;
  ipHash: string;
  limit: number;
  windowMinutes: number;
}): Promise<void> {
  const windowStart = new Date(Date.now() - input.windowMinutes * 60_000);
  const seen = await countDocs("audit_logs", {
    createdAt: { $gte: windowStart },
    action: input.action,
    ipHash: input.ipHash,
  });

  if (seen >= input.limit) {
    const resetsAt = windowStart.getTime() + input.windowMinutes * 60_000;
    throw new RateLimitedError(Math.max(Math.ceil((resetsAt - Date.now()) / 1000), 1));
  }
}

/**
 * Records an attempt at a public form endpoint under the action the limiter
 * counts — a rejected application, a status lookup that matched nothing.
 *
 * Without this a scripted client could hammer a form with invalid data forever:
 * the guard only sees the attempts the service was willing to store.
 */
export async function noteFormAttempt(input: {
  action: string;
  ipHash: string;
  userAgent: string;
  reason: string;
}): Promise<void> {
  await recordAudit({
    action: input.action,
    resourceType: "public_form",
    // The reason is our own word, never the submitted text.
    summary: `Attempt recorded (${input.reason})`,
    metadata: { reason: input.reason },
    ipHash: input.ipHash,
    userAgent: input.userAgent,
  });
}
