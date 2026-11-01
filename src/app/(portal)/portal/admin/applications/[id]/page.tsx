import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/cms-form";
import { Field } from "@/components/field";
import { PanelShell } from "@/components/panel-shell";
import { formatDateTime, formatFileSize } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import { makeCsrfToken, principalHas } from "@/server/auth/session";
import { requirePanel } from "@/server/auth/gate";
import { APPLICATION_STATUSES, getApplicationDetailForAdmin } from "@/server/content/library";
import { changeApplicationStatusAction } from "@/server/content/library-actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getApplicationDetailForAdmin(id).catch(() => null);
  const reference = detail?.application.referenceNumber;
  return pageMetadata({
    title: reference ? `Application ${reference}` : "Application",
    description: "One admission application and the office's notes on it.",
    path: `/portal/admin/applications/${id}`,
    noIndex: true,
  });
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Not submitted",
  submitted: "Submitted",
  under_review: "Under review",
  documents_required: "Documents needed",
  interview_scheduled: "Interview booked",
  accepted: "Accepted",
  rejected: "Not offered",
  withdrawn: "Withdrawn",
};

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[0.8rem] uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
        {label}
      </dt>
      <dd className="mt-0.5 text-[0.95rem]" style={{ color: value ? "var(--ink)" : "var(--ink-muted)" }}>
        {value?.trim() || "not given"}
      </dd>
    </div>
  );
}

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePanel("admission.view", `/portal/admin/applications/${id}`);
  const detail = await getApplicationDetailForAdmin(id);
  if (!detail) notFound();

  const { application, className, files, history } = detail;
  const csrfToken = makeCsrfToken(actor.sessionId);
  const canReview = principalHas(actor, "admission.review");
  const canDecide = principalHas(actor, "admission.decide");
  const current = STATUS_LABEL[application.status] ?? application.status;

  return (
    <PanelShell
      actor={actor}
      active="/portal/admin/applications"
      eyebrow="Admissions desk"
      title={`${application.firstName} ${application.lastName}`}
      intro={`Reference ${application.referenceNumber}, currently ${current.toLowerCase()}. This file is visible only to staff holding the admissions permission.`}
    >
      <p className="mb-6">
        <Link href="/portal/admin/applications" className="text-[0.9rem] font-semibold" style={{ color: "var(--accent)" }}>
          ← All applications
        </Link>
      </p>

      <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <section className="card p-6">
            <h2 className="text-[1.1rem]">The pupil</h2>
            <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Row label="Date of birth" value={application.dateOfBirth} />
              <Row label="Applying for" value={className} />
              <Row label="Gender" value={application.gender} />
              <Row label="Nationality" value={application.nationality} />
              <Row label="Mother tongue" value={application.motherTongue} />
              <Row label="Transport required" value={application.transportRequired ? "Yes" : "No"} />
              <Row label="Previous school" value={application.previousSchoolName} />
              <Row label="Last class completed" value={application.previousClassCompleted} />
            </dl>
          </section>

          <section className="card mt-6 p-6">
            <h2 className="text-[1.1rem]">The family</h2>
            <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Row
                label="Guardian"
                value={`${application.guardianFirstName} ${application.guardianLastName}${
                  application.guardianRelation ? ` (${application.guardianRelation})` : ""
                }`}
              />
              <Row label="Email" value={application.guardianEmail} />
              <Row label="Phone" value={application.guardianPhone} />
              <Row label="Occupation" value={application.guardianOccupation} />
              <Row label="Second contact" value={application.secondGuardianName} />
              <Row label="Second phone" value={application.secondGuardianPhone} />
              <Row
                label="Address"
                value={[application.addressLine, application.city, application.postalCode].filter(Boolean).join(", ")}
              />
              <Row label="Landmark" value={application.nearestLandmark} />
            </dl>
          </section>

          <section className="card mt-6 p-6">
            <h2 className="text-[1.1rem]">Documents</h2>
            {files.length === 0 ? (
              <p className="mt-3 text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
                No document was attached to this application.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {files.map((file) => (
                  <li key={file.documentId} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 first:border-t-0 first:pt-0" style={{ borderColor: "var(--line)" }}>
                    <div>
                      <p className="text-[0.92rem] font-semibold" style={{ color: "var(--ink)" }}>
                        {file.documentType.replace(/_/g, " ")}
                      </p>
                      <p className="text-[0.82rem]" style={{ color: "var(--ink-muted)" }}>
                        {file.filename ?? "file no longer stored"}
                        {file.sizeBytes ? ` · ${formatFileSize(file.sizeBytes)}` : ""}
                      </p>
                    </div>
                    {file.available ? (
                      <a
                        href={`/api/portal/applications/documents/${file.documentId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="button button-secondary button-small"
                      >
                        Open
                      </a>
                    ) : (
                      <span className="tag">unavailable</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card mt-6 p-6">
            <h2 className="text-[1.1rem]">What has happened</h2>
            {history.length === 0 ? (
              <p className="mt-3 text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
                The application has not moved since it arrived.
              </p>
            ) : (
              <ol className="mt-4 space-y-3">
                {history.map((entry, index) => (
                  <li key={`${entry.toStatus}-${index}`} className="border-l-2 pl-4" style={{ borderColor: "var(--line-strong)" }}>
                    <p className="text-[0.92rem] font-semibold" style={{ color: "var(--ink)" }}>
                      {STATUS_LABEL[entry.toStatus] ?? entry.toStatus}
                    </p>
                    <p className="text-[0.82rem]" style={{ color: "var(--ink-muted)" }}>
                      {formatDateTime(entry.changedAt) ?? "time not recorded"}
                    </p>
                    {entry.note && (
                      <p className="mt-1 text-[0.88rem]" style={{ color: "var(--ink)" }}>
                        {entry.note}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside>
          <div className="card p-6">
            <h2 className="text-[1.1rem]">Record a state</h2>
            <p className="mt-2 text-[0.86rem]" style={{ color: "var(--ink-muted)" }}>
              Received {formatDateTime(application.submittedAt) ?? "—"}
              {application.flaggedAsSpam ? " · flagged as a possible duplicate or bot" : ""}
            </p>
            {canReview ? (
              <div className="mt-4">
                <ActionForm
                  action={changeApplicationStatusAction}
                  csrfToken={csrfToken}
                  submitLabel="Save the new state"
                  hidden={{ id: application.id }}
                  note={canDecide ? undefined : "Accepting or refusing a place is the principal's call."}
                >
                  <Field
                    uid={`detail-${application.id}`}
                    name="status"
                    label="New state"
                    as="select"
                    required
                    defaultValue={application.status}
                    options={APPLICATION_STATUSES.map((status) => ({
                      value: status,
                      label:
                        (status === "accepted" || status === "rejected") && !canDecide
                          ? `${STATUS_LABEL[status]} — a principal decides this`
                          : STATUS_LABEL[status],
                    }))}
                  />
                  <Field
                    uid={`detail-${application.id}`}
                    name="notes"
                    label="Office note"
                    as="textarea"
                    rows={4}
                    defaultValue={application.decisionNotes}
                    hint="Internal only. The tracking page shows the state, not this note."
                  />
                </ActionForm>
              </div>
            ) : (
              <p className="mt-4 text-[0.9rem]" style={{ color: "var(--ink-muted)" }}>
                This account may read the file but not change its state.
              </p>
            )}
          </div>

          <div className="card mt-6 p-6">
            <h2 className="text-[1.1rem]">Consent and declaration</h2>
            <dl className="mt-4 space-y-3">
              <Row label="Photograph consent" value={application.photoConsent?.replace(/_/g, " ")} />
              <Row
                label="Declaration"
                value={application.declarationAccepted ? "Accepted by the guardian" : "Not accepted"}
              />
              <Row label="Last change" value={formatDateTime(application.updatedAt)} />
            </dl>
            <p className="mt-4 text-[0.82rem]" style={{ color: "var(--ink-muted)" }}>
              Changing a file never edits the family's own words. Anything the office decides is recorded in the note
              and the history above, so a later reader can tell the two apart.
            </p>
          </div>
        </aside>
      </div>
    </PanelShell>
  );
}
