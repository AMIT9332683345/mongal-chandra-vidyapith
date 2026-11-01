import Link from "next/link";
import { EmptyState } from "@/components/section-heading";
import { PanelShell } from "@/components/panel-shell";
import { formatDateTime } from "@/lib/format";
import { auditFacets, countAuditLog, listAuditLog, type AuditFilter } from "@/server/auth/audit";
import { findDocs } from "@/server/db/mongo/repository";
import { pageMetadata } from "@/lib/metadata";
import { requirePanel } from "@/server/auth/gate";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Audit trail",
  description: "Every recorded change: who made it, to which record, and when.",
  path: "/portal/content/audit",
  noIndex: true,
});

const PAGE_SIZE = 50;

const SINCE_OPTIONS = [
  { value: "24h", label: "Last 24 hours", hours: 24 },
  { value: "7d", label: "Last 7 days", hours: 24 * 7 },
  { value: "30d", label: "Last 30 days", hours: 24 * 30 },
  { value: "all", label: "Everything kept", hours: null },
];

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function AuditTrailPanelPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const actor = await requirePanel("audit_log.view", "/portal/content/audit");
  const params = await searchParams;

  const since = SINCE_OPTIONS.find((option) => option.value === first(params.since)) ?? SINCE_OPTIONS[3];
  const action = first(params.action);
  const who = first(params.who);
  const page = Math.max(Number.parseInt(first(params.page) || "1", 10) || 1, 1);

  const filter: AuditFilter = {
    ...(action ? { action } : {}),
    ...(who ? { actorUserId: who } : {}),
    ...(since.hours ? { from: new Date(Date.now() - since.hours * 60 * 60 * 1000) } : {}),
  };

  const [entries, total, facets, people] = await Promise.all([
    listAuditLog({ ...filter, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    countAuditLog(filter),
    auditFacets(),
    findDocs("users", {}, { projection: { id: 1, displayName: 1, email: 1 } }),
  ]);

  const names = new Map(people.map((person) => [person.id, person.displayName || person.email]));
  const actorChoices = facets.actors.filter((id) => names.has(id));
  const lastPage = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  /** A link that keeps the filters already chosen and changes one thing. */
  function hrefFor(change: Record<string, string>): string {
    const query = new URLSearchParams();
    const merged = { since: since.value, action, who, page: "1", ...change };
    for (const [key, value] of Object.entries(merged)) {
      if (value && !(key === "page" && value === "1") && !(key === "since" && value === "all")) {
        query.set(key, value);
      }
    }
    const suffix = query.toString();
    return `/portal/content/audit${suffix ? `?${suffix}` : ""}`;
  }

  return (
    <PanelShell
      actor={actor}
      active="/portal/content/audit"
      eyebrow="Content panel"
      title="Audit trail"
      intro="One row per recorded change. It says who acted, in which role, against which record and at what moment. It is written by the same request that makes the change, so a page that did nothing leaves no line behind."
    >
      <section className="card p-5">
        <h2 className="eyebrow">Filter</h2>
        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-5">
          <div>
            <h3 className="text-[0.88rem] font-semibold">Period</h3>
            <ul className="mt-1.5 flex flex-wrap gap-2 text-[0.88rem]">
              {SINCE_OPTIONS.map((option) => (
                <li key={option.value}>
                  <Link
                    href={hrefFor({ since: option.value, page: "1" })}
                    aria-current={option.value === since.value ? "page" : undefined}
                    className={option.value === since.value ? "font-bold" : undefined}
                    style={{ color: option.value === since.value ? "var(--accent)" : "var(--ink-secondary)" }}
                  >
                    {option.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* A plain GET form: the filter works before any script has loaded. */}
          {facets.actions.length > 0 && (
            <form method="get" action="/portal/content/audit">
              <input type="hidden" name="since" value={since.value} />
              <input type="hidden" name="who" value={who} />
              <h3 className="text-[0.88rem] font-semibold">
                <label htmlFor="audit-action">Recorded action</label>
              </h3>
              <div className="mt-1.5 flex items-end gap-2">
                <select id="audit-action" name="action" defaultValue={action}>
                  <option value="">Every action</option>
                  {facets.actions.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
                <button type="submit" className="button button-secondary button-small">
                  Apply
                </button>
              </div>
            </form>
          )}

          {actorChoices.length > 0 && (
            <form method="get" action="/portal/content/audit">
              <input type="hidden" name="since" value={since.value} />
              <input type="hidden" name="action" value={action} />
              <h3 className="text-[0.88rem] font-semibold">
                <label htmlFor="audit-who">Person</label>
              </h3>
              <div className="mt-1.5 flex items-end gap-2">
                <select id="audit-who" name="who" defaultValue={who}>
                  <option value="">Anyone with a panel</option>
                  {actorChoices.map((id) => (
                    <option key={id} value={id}>
                      {names.get(id)}
                    </option>
                  ))}
                </select>
                <button type="submit" className="button button-secondary button-small">
                  Apply
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="mt-4 text-[0.86rem]" style={{ color: "var(--ink-muted)" }}>
          {total === 0
            ? "Nothing matches."
            : `${from}–${to} of ${total} matching ${total === 1 ? "entry" : "entries"}.`}
          {action || who || since.value !== "all" ? (
            <>
              {" "}
              <Link href="/portal/content/audit" style={{ color: "var(--accent)" }}>
                Clear the filters
              </Link>
              .
            </>
          ) : null}
        </p>
      </section>

      {entries.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No entries to show"
            note="Either nothing has changed in this period, or the filters exclude what did. The trail is not a log of visits — it is a log of writes."
          />
        </div>
      ) : (
        <ol className="mt-8 space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="card p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
                  {formatDateTime(entry.createdAt) ?? "unknown time"}
                </span>
                <strong className="text-[0.95rem]">{entry.summary || entry.action}</strong>
              </div>
              <p className="mt-1 text-[0.86rem]" style={{ color: "var(--ink-secondary)" }}>
                {entry.actorUserId ? names.get(entry.actorUserId) ?? "an account since removed" : "no signed-in person"}
                {entry.actorRoleKey ? ` · acting as ${entry.actorRoleKey}` : ""} ·{" "}
                <code style={{ fontSize: "0.82rem" }}>{entry.action}</code> · {entry.resourceType}
                {entry.resourceId ? ` ${entry.resourceId}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}

      {lastPage > 1 && (
        <nav aria-label="Audit trail pages" className="mt-8 flex items-center gap-4 text-[0.9rem]">
          {page > 1 ? (
            <Link href={hrefFor({ page: `${page - 1}` })} className="button button-secondary button-small">
              Newer entries
            </Link>
          ) : null}
          {page < lastPage ? (
            <Link href={hrefFor({ page: `${page + 1}` })} className="button button-secondary button-small">
              Older entries
            </Link>
          ) : null}
          <span style={{ color: "var(--ink-muted)" }}>
            Page {page} of {lastPage}
          </span>
        </nav>
      )}

      <p className="pending mt-10">
        <strong>What is deliberately absent.</strong> Passwords, tokens, session identifiers and secrets are dropped
        before a row is written, and a person's address is stored only as a hash, so an entry proves where a change came
        from without turning the trail into a copy of the private data it describes. Entries are kept, not edited: there
        is no control on this page that changes or removes one.
      </p>
    </PanelShell>
  );
}
