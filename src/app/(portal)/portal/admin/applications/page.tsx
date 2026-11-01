import Link from "next/link";
import { ActionForm } from "@/components/cms-form";
import { Field } from "@/components/field";
import { PanelShell } from "@/components/panel-shell";
import { EmptyState } from "@/components/section-heading";
import { pageMetadata } from "@/lib/metadata";
import { makeCsrfToken, principalHas } from "@/server/auth/session";
import { requirePanel } from "@/server/auth/gate";
import {
  APPLICATION_STATUSES,
  listApplicationsForAdmin,
  type ApplicationStatus,
} from "@/server/content/library";
import { changeApplicationStatusAction } from "@/server/content/library-actions";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Applications",
  description: "Admission applications waiting for a decision.",
  path: "/portal/admin/applications",
  noIndex: true,
});

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  draft: "Not submitted",
  submitted: "Submitted",
  under_review: "Under review",
  documents_required: "Documents needed",
  interview_scheduled: "Interview booked",
  accepted: "Accepted",
  rejected: "Not offered",
  withdrawn: "Withdrawn",
};

function shortDateTime(value: Date | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function isStatus(value: string | undefined): value is ApplicationStatus {
  return !!value && (APPLICATION_STATUSES as readonly string[]).includes(value);
}

export default async function ApplicationsPanelPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const actor = await requirePanel("admission.view", "/portal/admin/applications");
  const { status: rawStatus } = await searchParams;
  const filter = isStatus(rawStatus) ? rawStatus : undefined;
  const rows = await listApplicationsForAdmin({ status: filter });
  const csrfToken = makeCsrfToken(actor.sessionId);
  const canReview = principalHas(actor, "admission.review");
  const canDecide = principalHas(actor, "admission.decide");

  const counts = await listApplicationsForAdmin();
  const openCount = counts.filter(
    (row) => row.status === "submitted" || row.status === "under_review" || row.status === "documents_required",
  ).length;

  return (
    <PanelShell
      actor={actor}
      active="/portal/admin/applications"
      eyebrow="Admissions desk"
      title="Applications"
      intro="Every form a family has sent, in the order it arrived. The reference number is what they quote on the phone; the notes here are for the office and are never shown to the family."
    >
      <p className="mb-6 text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
        {openCount === 0
          ? "Nothing is waiting for a first decision."
          : `${openCount} application${openCount === 1 ? "" : "s"} still open.`}
      </p>

      <nav aria-label="Filter by state" className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/portal/admin/applications"
          className={`tag ${filter ? "" : "is-active"}`}
          style={filter ? undefined : { borderColor: "var(--accent)", color: "var(--accent)" }}
        >
          All
        </Link>
        {APPLICATION_STATUSES.map((status) => (
          <Link
            key={status}
            href={`/portal/admin/applications?status=${status}`}
            className="tag"
            style={filter === status ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
          >
            {STATUS_LABEL[status]}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          title={filter ? "No application is in that state" : "No applications yet"}
          note="The online form writes here directly. A family that applied on paper can be entered by the office."
        />
      ) : (
        <ul className="space-y-4">
          {rows.map((row) => {
            const decided = row.status === "accepted" || row.status === "rejected";
            return (
              <li key={row.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold" style={{ color: "var(--ink)" }}>
                      {row.firstName} {row.lastName}
                    </p>
                    <p className="mt-1 text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
                      {row.referenceNumber} · born {row.dateOfBirth} · received {shortDateTime(row.submittedAt)}
                    </p>
                    <p className="mt-1 text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
                      {row.guardianFirstName} {row.guardianLastName} · {row.guardianEmail}
                      {row.guardianPhone ? ` · ${row.guardianPhone}` : ""}
                    </p>
                    <p className="mt-2 flex flex-wrap gap-2 text-[0.78rem]">
                      <span
                        className="tag"
                        style={
                          row.status === "accepted"
                            ? { borderColor: "var(--accent)", color: "var(--accent)" }
                            : row.status === "rejected"
                              ? { borderColor: "var(--alert)", color: "var(--alert)" }
                              : undefined
                        }
                      >
                        {STATUS_LABEL[row.status]}
                      </span>
                      {row.flaggedAsSpam && <span className="tag">flagged as spam</span>}
                      {row.decidedAt && <span className="tag">decided {shortDateTime(row.decidedAt)}</span>}
                    </p>
                    {row.decisionNotes && (
                      <p className="mt-3 text-[0.88rem]" style={{ color: "var(--ink)" }}>
                        <strong>Office note:</strong> {row.decisionNotes}
                      </p>
                    )}
                  </div>
                  <Link href={`/portal/admin/applications/${row.id}`} className="button button-secondary button-small">
                    Open the file
                  </Link>
                </div>

                {canReview ? (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-[0.88rem] font-semibold" style={{ color: "var(--accent)" }}>
                      Move this application
                    </summary>
                    <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--line)" }}>
                      <ActionForm
                        action={changeApplicationStatusAction}
                        csrfToken={csrfToken}
                        submitLabel="Save the new state"
                        hidden={{ id: row.id }}
                        note={
                          canDecide
                            ? "Accepting or refusing a place tells the family through the tracking page."
                            : "This account may review a file but not accept or refuse it."
                        }
                      >
                        <div className="grid gap-x-6 sm:grid-cols-2">
                          <Field
                            uid={`application-${row.id}`}
                            name="status"
                            label="New state"
                            as="select"
                            required
                            defaultValue={row.status}
                            options={APPLICATION_STATUSES.map((status) => ({
                              value: status,
                              label:
                                (status === "accepted" || status === "rejected") && !canDecide
                                  ? `${STATUS_LABEL[status]} — a principal decides this`
                                  : STATUS_LABEL[status],
                            }))}
                          />
                          <Field
                            uid={`application-${row.id}`}
                            name="notes"
                            label="Office note"
                            as="textarea"
                            rows={3}
                            defaultValue={row.decisionNotes}
                            hint="Internal only. Never shown on the tracking page."
                          />
                        </div>
                      </ActionForm>
                    </div>
                  </details>
                ) : null}

                {decided && !canDecide ? (
                  <p className="mt-3 text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
                    A decision has been recorded for this file.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </PanelShell>
  );
}
