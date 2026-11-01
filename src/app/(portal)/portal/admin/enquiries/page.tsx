import Link from "next/link";
import { ActionForm } from "@/components/cms-form";
import { Field } from "@/components/field";
import { PanelShell } from "@/components/panel-shell";
import { EmptyState } from "@/components/section-heading";
import { pageMetadata } from "@/lib/metadata";
import { makeCsrfToken, principalHas } from "@/server/auth/session";
import { requirePanel } from "@/server/auth/gate";
import { listEnquiriesForAdmin } from "@/server/content/library";
import { changeEnquiryStatusAction } from "@/server/content/library-actions";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Enquiries",
  description: "Messages from families, and where each one has got to.",
  path: "/portal/admin/enquiries",
  noIndex: true,
});

const ENQUIRY_STATUSES = ["open", "in_progress", "awaiting_applicant", "completed", "rejected", "cancelled"] as const;

const STATUS_LABEL: Record<string, string> = {
  open: "New",
  in_progress: "Being handled",
  awaiting_applicant: "Waiting on the family",
  completed: "Answered",
  rejected: "Not a genuine enquiry",
  cancelled: "Cancelled",
};

const KIND_LABEL: Record<string, string> = {
  general: "General",
  admission: "Admissions",
  fees: "Fees",
  transport: "Transport",
  careers: "Careers",
  complaint: "Complaint",
};

function shortDateTime(value: Date | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function isStatus(value: string | undefined): value is (typeof ENQUIRY_STATUSES)[number] {
  return !!value && (ENQUIRY_STATUSES as readonly string[]).includes(value);
}

export default async function EnquiriesPanelPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const actor = await requirePanel("enquiry.view", "/portal/admin/enquiries");
  const { status: rawStatus } = await searchParams;
  const filter = isStatus(rawStatus) ? rawStatus : undefined;
  const rows = await listEnquiriesForAdmin({ status: filter });
  const csrfToken = makeCsrfToken(actor.sessionId);
  const canRespond = principalHas(actor, "enquiry.respond");

  const all = await listEnquiriesForAdmin();
  const waiting = all.filter((row) => row.status === "open" || row.status === "in_progress").length;
  const suspicious = all.filter((row) => row.flaggedAsSpam).length;

  return (
    <PanelShell
      actor={actor}
      active="/portal/admin/enquiries"
      eyebrow="Office desk"
      title="Enquiries"
      intro="Every message sent from the contact page or the admissions page, with the reply the office gave. A family's words stay as written; the office's answer is recorded beside them."
    >
      <p className="mb-6 flex flex-wrap gap-x-6 gap-y-1 text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
        <span>
          {waiting === 0 ? "Nothing is waiting for an answer." : `${waiting} enquir${waiting === 1 ? "y" : "ies"} waiting.`}
        </span>
        {suspicious > 0 && <span>{suspicious} flagged as possible spam.</span>}
      </p>

      <nav aria-label="Filter by state" className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/portal/admin/enquiries"
          className="tag"
          style={filter ? undefined : { borderColor: "var(--accent)", color: "var(--accent)" }}
        >
          All
        </Link>
        {ENQUIRY_STATUSES.map((status) => (
          <Link
            key={status}
            href={`/portal/admin/enquiries?status=${status}`}
            className="tag"
            style={filter === status ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
          >
            {STATUS_LABEL[status]}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          title={filter ? "No enquiry is in that state" : "No enquiries yet"}
          note="Messages arrive here from the public contact form. Nothing is written into this list by the site itself."
        />
      ) : (
        <ul className="space-y-4">
          {rows.map((row) => (
            <li key={row.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-semibold" style={{ color: "var(--ink)" }}>
                    {row.name}
                    {row.subject ? ` — ${row.subject}` : ""}
                  </p>
                  <p className="mt-1 text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
                    {row.email}
                    {row.phone ? ` · ${row.phone}` : ""} · {shortDateTime(row.createdAt)}
                  </p>
                  <p className="mt-2 flex flex-wrap gap-2 text-[0.78rem]">
                    <span
                      className="tag"
                      style={
                        row.status === "completed"
                          ? { borderColor: "var(--accent)", color: "var(--accent)" }
                          : row.status === "rejected"
                            ? { borderColor: "var(--alert)", color: "var(--alert)" }
                            : undefined
                      }
                    >
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                    <span className="tag">{KIND_LABEL[row.kind] ?? row.kind}</span>
                    {row.flaggedAsSpam && <span className="tag">possible spam</span>}
                  </p>
                </div>
              </div>

              <blockquote
                className="mt-4 border-l-2 pl-4 text-[0.95rem]"
                style={{ borderColor: "var(--line-strong)", color: "var(--ink)" }}
              >
                {row.message}
              </blockquote>

              {row.responseText && (
                <div className="mt-4 text-[0.92rem]" style={{ color: "var(--ink)" }}>
                  <strong>Office reply:</strong> {row.responseText}
                </div>
              )}

              {canRespond ? (
                <details className="mt-4">
                  <summary className="cursor-pointer text-[0.88rem] font-semibold" style={{ color: "var(--accent)" }}>
                    Record the office's handling
                  </summary>
                  <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--line)" }}>
                    <ActionForm
                      action={changeEnquiryStatusAction}
                      csrfToken={csrfToken}
                      submitLabel="Save"
                      hidden={{ id: row.id }}
                      note="The reply is kept with the enquiry. It is not sent by this site."
                    >
                      <div className="grid gap-x-6 sm:grid-cols-2">
                        <Field
                          uid={`enquiry-${row.id}`}
                          name="status"
                          label="Where it stands"
                          as="select"
                          required
                          defaultValue={row.status}
                          options={ENQUIRY_STATUSES.map((status) => ({
                            value: status,
                            label: STATUS_LABEL[status],
                          }))}
                        />
                        <Field
                          uid={`enquiry-${row.id}`}
                          name="responseText"
                          label="What the office said"
                          as="textarea"
                          rows={4}
                          defaultValue={row.responseText}
                        />
                      </div>
                    </ActionForm>
                  </div>
                </details>
              ) : (
                <p className="mt-3 text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
                  This account may read enquiries but not answer them.
                </p>
              )}

              <p className="mt-3">
                <a href={`mailto:${row.email}`} className="text-[0.88rem] font-semibold" style={{ color: "var(--accent)" }}>
                  Write to {row.name}
                </a>
              </p>
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}
