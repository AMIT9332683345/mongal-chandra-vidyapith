"use client";

import { useRef, useState } from "react";

/**
 * The public progress check for one admission application.
 *
 * It posts rather than building the pair into a URL, because a reference number
 * and a date of birth together are the family&rsquo;s private key to the file and
 * must not land in browser history, a referrer header, or an access log. What
 * comes back is the school&rsquo;s status word and a dated trail — never an uploaded
 * document, which stays behind the admission desk&rsquo;s login.
 */
type TimelineEntry = { toStatus: string; changedAt: string; note: string | null };

type StatusRecord = {
  referenceNumber: string;
  status: string;
  submittedOn: string;
  updatedAt: string;
  applyingClassName: string | null;
  timeline: TimelineEntry[];
  documentSummary: { documentType: string; verified: boolean }[];
  interview: { scheduledAt: string | null; venue: string | null };
  decision: { label: string; notes: string | null } | null;
};

const STATUS_LABELS: Record<string, string> = {
  submitted: "Received",
  under_review: "Being reviewed",
  documents_required: "Papers needed",
  interview_scheduled: "Meeting arranged",
  accepted: "Provisionally accepted",
  rejected: "Not accepted this cycle",
  withdrawn: "Withdrawn",
};

const DOC_LABELS: Record<string, string> = {
  birth_certificate: "Birth certificate",
  transfer_certificate: "Transfer certificate",
  report_card: "Last report card",
  address_proof: "Address proof",
  photo: "Photograph",
  other: "Another document",
};

function when(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function whenMinute(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}

export function StatusLookup({ token }: { token: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [record, setRecord] = useState<StatusRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setRecord(null);
    try {
      const response = await fetch("/api/applications/status", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok: true; status: StatusRecord }
        | { ok: false; error: { code: string; message: string; fields?: Record<string, string[]> } }
        | null;

      if (response.ok && payload?.ok) {
        setRecord(payload.status);
      } else {
        const message = payload && !payload.ok ? payload.error.message : "The check could not be completed.";
        setError(message);
      }
    } catch {
      setError("The connection to the school failed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <form ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-x-6 sm:grid-cols-2">
        <p className="mb-4">
          <label htmlFor="status-reference" className="block">
            Reference number <span style={{ color: "var(--alert)" }}>*</span>
          </label>
          <span id="status-reference-hint" className="block text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
            As printed on the confirmation, for example MCV-2026-QK4XZ7.
          </span>
          <input id="status-reference" name="referenceNumber" required autoComplete="off" aria-describedby="status-reference-hint" className="mt-1.5" />
        </p>
        <p className="mb-4">
          <label htmlFor="status-dob" className="block">
            Applicant&rsquo;s date of birth <span style={{ color: "var(--alert)" }}>*</span>
          </label>
          <span id="status-dob-hint" className="block text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
            Needed as a second check, so a reference number alone cannot be read by anyone else.
          </span>
          <input id="status-dob" name="dateOfBirth" type="date" required aria-describedby="status-dob-hint" className="mt-1.5" />
        </p>
        <input type="hidden" name="csrfToken" value={token} readOnly />
        <div hidden aria-hidden="true">
          <label htmlFor="status-honeypot">Please leave this field empty</label>
          <input id="status-honeypot" name="website" type="text" autoComplete="off" tabIndex={-1} defaultValue="" />
        </div>

        <p className="sm:col-span-2">
          <button type="submit" className="button button-primary" disabled={pending}>
            {pending ? "Checking…" : "Check the progress"}
          </button>
        </p>
      </form>

      <div aria-live="polite" role="status" className="mt-6">
        {error && (
          <p
            role="alert"
            className="border p-4"
            style={{ borderColor: "var(--alert)", background: "var(--surface)", borderRadius: "var(--radius)", color: "var(--ink)" }}
          >
            {error}
          </p>
        )}

        {record && (
          <div className="card p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="eyebrow m-0">Application {record.referenceNumber}</p>
              <p className="m-0 text-[0.88rem]" style={{ color: "var(--ink-muted)" }}>
                Last updated {whenMinute(record.updatedAt)}
              </p>
            </div>
            <p className="mt-3 text-[1.3rem] font-semibold" style={{ color: "var(--ink)", fontFamily: "var(--font-heading)" }}>
              {STATUS_LABELS[record.status] ?? record.status}
            </p>
            <p className="mt-1 text-[0.95rem]" style={{ color: "var(--ink-secondary)" }}>
              {record.applyingClassName ? `Class applied for: ${record.applyingClassName}. ` : ""}
              Received {when(record.submittedOn)}.
            </p>

            {record.decision && (
              <p className="mt-4 border-l pl-4" style={{ borderColor: "var(--accent)" }}>
                <strong style={{ color: "var(--ink)" }}>{record.decision.label}</strong>
                {record.decision.notes && (
                  <span className="block text-[0.94rem]" style={{ color: "var(--ink-secondary)" }}>
                    {record.decision.notes}
                  </span>
                )}
              </p>
            )}

            {record.interview.scheduledAt && (
              <p className="mt-4 text-[0.95rem]" style={{ color: "var(--ink)" }}>
                Meeting: {whenMinute(record.interview.scheduledAt)}
                {record.interview.venue ? ` at ${record.interview.venue}` : ""}
              </p>
            )}

            {record.documentSummary.length > 0 && (
              <div className="mt-6">
                <h3 className="text-[1rem]">Documents</h3>
                <p className="mt-1 text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
                  The files themselves are held privately; only the type and whether the office has checked it are shown
                  here.
                </p>
                <ul className="mt-2 list-none p-0">
                  {record.documentSummary.map((document, index) => (
                    <li key={`${document.documentType}-${index}`} className="py-1 text-[0.95rem]">
                      {DOC_LABELS[document.documentType] ?? document.documentType}
                      <span style={{ color: document.verified ? "var(--accent)" : "var(--ink-muted)" }}>
                        {" "}
                        — {document.verified ? "checked by the office" : "awaiting check"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {record.timeline.length > 0 && (
              <div className="mt-6">
                <h3 className="text-[1rem]">Trail</h3>
                <ol className="mt-2 list-none p-0">
                  {record.timeline.map((entry, index) => (
                    <li key={`${entry.changedAt}-${index}`} className="rule grid gap-1 py-2 first:border-t-0 sm:grid-cols-[9rem_1fr]">
                      <span className="text-[0.88rem]" style={{ color: "var(--ink-muted)" }}>
                        {when(entry.changedAt)}
                      </span>
                      <span className="text-[0.95rem]" style={{ color: "var(--ink)" }}>
                        {STATUS_LABELS[entry.toStatus] ?? entry.toStatus}
                        {entry.note ? ` — ${entry.note}` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
