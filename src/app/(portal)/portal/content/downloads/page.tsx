import { ActionForm } from "@/components/cms-form";
import { Field } from "@/components/field";
import { PanelShell } from "@/components/panel-shell";
import { EmptyState } from "@/components/section-heading";
import { formatFileSize } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import { makeCsrfToken, principalHas } from "@/server/auth/session";
import { requirePanel } from "@/server/auth/gate";
import { listDocumentsForAdmin } from "@/server/content/library";
import {
  deleteDocumentAction,
  setDocumentVisibilityAction,
  uploadDownloadsAction,
} from "@/server/content/library-actions";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Downloads",
  description: "Files published for families to download.",
  path: "/portal/content/downloads",
  noIndex: true,
});

const CATEGORY_OPTIONS = [
  { value: "general", label: "General" },
  { value: "admission", label: "Admissions" },
  { value: "circular", label: "Circular" },
  { value: "syllabus", label: "Syllabus" },
  { value: "form", label: "Form" },
  { value: "policy", label: "Policy" },
];

function formatWhen(value: Date): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(value);
}

export default async function DownloadsPanelPage() {
  const actor = await requirePanel("document.upload", "/portal/content/downloads");
  const rows = await listDocumentsForAdmin();
  const csrfToken = makeCsrfToken(actor.sessionId);
  const canDelete = principalHas(actor, "document.delete");

  return (
    <PanelShell
      actor={actor}
      active="/portal/content/downloads"
      eyebrow="Content panel"
      title="Downloads"
      intro="A file becomes readable on the public site only when it is marked public. A restricted file stays inside the school, even if its id is guessed."
    >
      <ActionForm
        action={uploadDownloadsAction}
        csrfToken={csrfToken}
        submitLabel="Upload files"
        resetOnSuccess
        note="PDF, JPEG, PNG or WebP. Choose the public visibility only after the office has approved the file."
      >
        <div className="grid gap-x-6 sm:grid-cols-2">
          <Field uid="download" name="title" label="Title shown on the site" required />
          <Field uid="download" name="category" label="Category" as="select" options={CATEGORY_OPTIONS} />
          <Field uid="download" name="description" label="Description" as="textarea" rows={3} />
          <Field
            uid="download"
            name="visibility"
            label="Visibility"
            as="select"
            options={[
              { value: "public", label: "Public — listed on /downloads" },
              { value: "restricted", label: "Restricted — staff only" },
            ]}
          />
          <Field uid="download" name="files" label="Files" type="file" multiple required accept=".pdf,image/jpeg,image/png,image/webp" hint="Up to ten files, each under the upload size limit." />
        </div>
      </ActionForm>

      <section className="rule mt-10 pt-8">
        <h2 className="text-[1.15rem]">Every file</h2>
        {rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No files uploaded yet" note="The public downloads page stays empty until the office publishes a file." />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table>
              <caption className="sr-only">Files, their visibility and what may be done to them</caption>
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col">Category</th>
                  <th scope="col">Visibility</th>
                  <th scope="col">Size</th>
                  <th scope="col">Uploaded</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row" className="text-left font-semibold">
                      {row.title ?? row.originalFilename}
                      <span className="block text-[0.8rem] font-normal" style={{ color: "var(--ink-muted)" }}>
                        {row.originalFilename} · {row.mimeType}
                      </span>
                    </th>
                    <td>{row.category ?? "general"}</td>
                    <td>
                      <span
                        className="tag"
                        style={
                          row.visibility === "public"
                            ? { borderColor: "var(--accent)", color: "var(--accent)" }
                            : undefined
                        }
                      >
                        {row.visibility}
                      </span>
                    </td>
                    <td>{formatFileSize(row.sizeBytes) ?? "—"}</td>
                    <td>{formatWhen(row.createdAt)}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <a href={`/api/downloads/${row.id}`} className="button button-secondary button-small">
                          Open
                        </a>
                        <ActionForm
                          action={setDocumentVisibilityAction}
                          csrfToken={csrfToken}
                          submitLabel={row.visibility === "public" ? "Make restricted" : "Make public"}
                          variant="secondary"
                          small
                          inline
                          hidden={{
                            id: row.id,
                            visibility: row.visibility === "public" ? "restricted" : "public",
                          }}
                        />
                        {canDelete ? (
                          <ActionForm
                            action={deleteDocumentAction}
                            csrfToken={csrfToken}
                            submitLabel="Retire"
                            variant="danger"
                            small
                            inline
                            confirm={`Retire “${row.title ?? row.originalFilename}”? It disappears from the website but stays in the audit trail.`}
                            hidden={{ id: row.id, confirm: "true" }}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PanelShell>
  );
}
