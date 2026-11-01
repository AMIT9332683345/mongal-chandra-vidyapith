import type { Document } from "mongodb";
import { countDocs, distinctValues, findDocs, insertDoc } from "@/server/db/mongo/repository";
import type { AuditLogsDoc } from "@/server/db/mongo/schema.generated";

/**
 * The audit trail.
 *
 * Every state-changing operation writes one row describing who did what to
 * which record. Two rules shape this module:
 *
 * 1. Recording must never break the operation it describes. A failed insert is
 *    logged to the server console, not thrown to the user — a school should not
 *    lose a notice publication because the audit collection is unreachable.
 * 2. `metadata` is for small before/after fragments only. Password hashes,
 *    session tokens, full contact details of minors and document contents are
 *    deliberately excluded; `redact` drops obvious secret-bearing keys.
 */

export type AuditLogEntry = AuditLogsDoc;

const REDACTED_KEYS = /^(password|passwordhash|token|sessiontoken|csrftoken|secret|authorization|cookie|cvv|cardnumber|otp|pin)$/i;

export function redact(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (REDACTED_KEYS.test(key.toLowerCase())) continue;
    if (value instanceof Date) {
      clean[key] = value.toISOString();
    } else if (value === undefined) {
      continue;
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export type AuditInput = {
  actorUserId?: string | null;
  actorRoleKey?: string | null;
  /** Dot-separated, e.g. `notice.publish`. */
  action: string;
  resourceType: string;
  resourceId?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
  ipHash?: string | null;
  userAgent?: string | null;
};

/** Writes one audit row. Resolves once the row is committed. */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await insertDoc("audit_logs", {
      actorUserId: input.actorUserId ?? null,
      actorRoleKey: input.actorRoleKey ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      summary: input.summary ?? null,
      metadata: (redact(input.metadata) ?? null) as Document | null,
      ipHash: input.ipHash ?? null,
      userAgent: input.userAgent ? input.userAgent.slice(0, 512) : null,
    });
  } catch (error) {
    console.error(`[audit] failed to record ${input.action}`, error);
  }
}

/**
 * Convenience for the common case of an authenticated actor, so route handlers
 * do not repeat the principal destructuring.
 */
export async function recordAuditFor(
  actor: { userId: string; roleKeys: string[] } | null | undefined,
  input: Omit<AuditInput, "actorUserId" | "actorRoleKey">,
): Promise<void> {
  await recordAudit({
    ...input,
    actorUserId: actor?.userId ?? null,
    // The first role is the one the person is acting as; a multi-role account
    // is rare and the detail belongs in the resource row, not the trail.
    actorRoleKey: actor?.roleKeys[0] ?? null,
  });
}

/* -------------------------------------------------------------------------- */
/* Reading the trail                                                           */
/* -------------------------------------------------------------------------- */

export type AuditFilter = {
  actorUserId?: string;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
};

/**
 * Paged reads for the super-admin audit view. Filtering and paging are done by
 * the database, never by pulling the collection into memory.
 */
export async function listAuditLog(filter: AuditFilter = {}): Promise<AuditLogEntry[]> {
  return findDocs("audit_logs", auditWhere(filter), {
    sort: { createdAt: -1 },
    limit: Math.min(Math.max(filter.limit ?? 50, 1), 200),
    skip: Math.max(filter.offset ?? 0, 0),
  });
}

/** The same filter, without the paging, so the panel can say how many there are. */
export async function countAuditLog(filter: AuditFilter = {}): Promise<number> {
  return countDocs("audit_logs", auditWhere(filter));
}

/**
 * Who has written to the trail, and which acts appear in it.
 *
 * The panel offers these as choices instead of making a person type a user id or
 * a permission key from memory — a trail nobody can filter is a trail nobody reads.
 * The values come from the database's own distinct list, not a scan of the rows.
 */
export async function auditFacets(): Promise<{ actors: string[]; actions: string[] }> {
  const [actors, actions] = await Promise.all([
    distinctValues("audit_logs", "actorUserId"),
    distinctValues("audit_logs", "action"),
  ]);
  return {
    actors: actors.filter((value): value is string => typeof value === "string"),
    actions: actions.filter((value): value is string => typeof value === "string").sort(),
  };
}

function auditWhere(filter: AuditFilter): Document {
  const where: Document = {};
  if (filter.actorUserId) where.actorUserId = filter.actorUserId;
  if (filter.resourceType) where.resourceType = filter.resourceType;
  if (filter.resourceId) where.resourceId = filter.resourceId;
  if (filter.action) where.action = filter.action;
  if (filter.from || filter.to) {
    where.createdAt = {
      ...(filter.from ? { $gte: filter.from } : {}),
      ...(filter.to ? { $lte: filter.to } : {}),
    };
  }
  return where;
}
