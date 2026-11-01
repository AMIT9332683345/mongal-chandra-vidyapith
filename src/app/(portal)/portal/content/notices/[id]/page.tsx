import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/cms-form";
import { Field } from "@/components/field";
import { NoticeFields } from "@/components/notice-fields";
import { PanelShell } from "@/components/panel-shell";
import {
  getNoticeForAdmin,
  listNoticeAttachmentsForAdmin,
} from "@/server/content/admin";
import { listNoticeCategories } from "@/server/content/site";
import {
  addNoticeAttachmentAction,
  changeNoticeStatusAction,
  deleteNoticeAction,
  removeNoticeAttachmentAction,
  saveNoticeAction,
} from "@/server/content/actions";
import { makeCsrfToken, principalHas } from "@/server/auth/session";
import { requirePanel } from "@/server/auth/gate";
import { pageMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Edit a notice",
  description: "One notice, its state and its attachments.",
  path: "/portal/content/notices",
  noIndex: true,
});

function moment(value: Date | null): string {
  if (!value) return "never";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function NoticeEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePanel("notice.view", "/portal/content/notices");
  const { id } = await params;
  const notice = await getNoticeForAdmin(id);
  if (!notice) notFound();

  const [categories, attachments] = await Promise.all([
    listNoticeCategories(),
    listNoticeAttachmentsForAdmin(notice.id),
  ]);
  const csrfToken = makeCsrfToken(actor.sessionId);
  const canEdit = principalHas(actor, "notice.edit");
  const canPublish = principalHas(actor, "notice.publish");
  const canUpload = principalHas(actor, "document.upload") && canEdit;
  const isPublic = notice.audience === "public";
  const audienceLabel = notice.audience === "teachers" ? "teachers only" : "signed-in staff only";

  return (
    <PanelShell
      actor={actor}
      active="/portal/content/notices"
      eyebrow="Notice board"
      title={notice.title}
      intro={`State: ${notice.status}. This page is the only place a notice can be published, and publishing is a separate permission from writing one.`}
    >
      <dl className="card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="eyebrow">{isPublic ? "Public address" : "No public address"}</dt>
          <dd className="mt-1 text-[0.9rem]">
            {isPublic ? (
              <Link href={`/notices/${notice.slug}`} style={{ color: "var(--accent)" }}>
                /notices/{notice.slug}
              </Link>
            ) : (
              <>
                {audienceLabel}
                <span className="block text-[0.82rem]" style={{ color: "var(--ink-muted)" }}>
                  Read in the teacher area, never on the website.
                </span>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Published</dt>
          <dd className="mt-1 text-[0.9rem]">{moment(notice.publishedAt)}</dd>
        </div>
        <div>
          <dt className="eyebrow">Scheduled release</dt>
          <dd className="mt-1 text-[0.9rem]">{moment(notice.publishAt)}</dd>
        </div>
        <div>
          <dt className="eyebrow">Last changed</dt>
          <dd className="mt-1 text-[0.9rem]">{moment(notice.updatedAt)}</dd>
        </div>
      </dl>

      {!canEdit && (
        <p className="pending mt-6">
          <strong>You may read this notice but not change it.</strong> It needs the “notice.edit” permission. Everything
          below is shown so you can see what the board holds, and none of it will save for you.
        </p>
      )}

      <section className="rule mt-10 pt-8">
        <h2 className="text-[1.15rem]">The text</h2>
        {canEdit ? (
          <ActionForm
            action={saveNoticeAction}
            csrfToken={csrfToken}
            submitLabel="Save these changes"
            hidden={{ id: notice.id }}
            className="mt-4 max-w-3xl"
          >
            <NoticeFields uid="notice-editor" notice={notice} categories={categories} />
          </ActionForm>
        ) : (
          <div className="mt-4 space-y-2">
            <p className="text-[0.95rem] font-semibold">{notice.title}</p>
            <p className="whitespace-pre-line text-[0.93rem]">{notice.body}</p>
          </div>
        )}
      </section>

      <section className="rule mt-10 pt-8">
        <h2 className="text-[1.15rem]">Its state on the board</h2>
        {canPublish ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {notice.status !== "published" && (
              <ActionForm
                action={changeNoticeStatusAction}
                csrfToken={csrfToken}
                submitLabel="Publish now"
                variant="gold"
                small
                inline
                note={
                  isPublic
                    ? "Puts it on the public board at once."
                    : `Publishes it to ${audienceLabel}; the website will not show it.`
                }
                hidden={{ id: notice.id, intent: "publish" }}
              />
            )}
            {notice.status === "published" && (
              <ActionForm
                action={changeNoticeStatusAction}
                csrfToken={csrfToken}
                submitLabel="Take it down"
                variant="secondary"
                small
                inline
                note={isPublic ? "Out of the public list, kept in the record." : "Out of the staff area, kept in the record."}
                hidden={{ id: notice.id, intent: "unpublish" }}
              />
            )}
            {notice.status !== "archived" && (
              <ActionForm
                action={changeNoticeStatusAction}
                csrfToken={csrfToken}
                submitLabel="Archive"
                variant="secondary"
                small
                inline
                hidden={{ id: notice.id, intent: "archive" }}
              />
            )}
          </div>
        ) : (
          <p className="mt-3 text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
            Changing the state of a notice needs “notice.publish”.
          </p>
        )}

        {canPublish && (
          <div className="card mt-5 max-w-xl p-5">
            <h3 className="text-[1rem] font-semibold">Release it on a date</h3>
            <p className="mt-1 text-[0.88rem]" style={{ color: "var(--ink-muted)" }}>
              This build runs no background worker. A scheduled notice waits with its release time recorded, and the
              button on the panel overview — or the one below — makes every due notice live for its own audience when
              someone with the permission presses it.
            </p>
            <ActionForm
              action={changeNoticeStatusAction}
              csrfToken={csrfToken}
              submitLabel="Schedule it"
              variant="secondary"
              small
              hidden={{ id: notice.id, intent: "schedule" }}
              className="mt-3"
            >
              <Field
                uid={`schedule-${notice.id}`}
                name="publishAt"
                label="Release at"
                type="datetime-local"
                required
                hint="A time in the future, in the school's own timezone."
              />
            </ActionForm>
          </div>
        )}
      </section>

      <section className="rule mt-10 pt-8">
        <h2 className="text-[1.15rem]">Attachments</h2>
        <p className="mt-1 max-w-prose text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
          A circular in PDF, or a scanned order as an image. The file is reachable by the public only while the notice
          itself is published — taking the notice down locks what hangs off it.
        </p>

        {attachments.length > 0 ? (
          <ul className="mt-4 space-y-3" role="list" style={{ listStyle: "none" }}>
            {attachments.map((file) => (
              <li key={file.documentId} className="card flex flex-wrap items-center gap-3 p-3">
                <span className="text-[0.93rem]">
                  <strong>{file.label ?? file.title ?? "Untitled file"}</strong>{" "}
                  <span style={{ color: "var(--ink-muted)" }}>
                    {file.mimeType.toUpperCase().replace("APPLICATION/", "")} · {fileSize(file.sizeBytes)}
                  </span>
                  {file.downloadable ? null : (
                    <span className="tag ml-2">held back while the notice is not public</span>
                  )}
                </span>
                {file.downloadable && (
                  <a
                    href={`/api/downloads/${file.documentId}`}
                    className="button button-secondary button-small"
                    style={{ marginLeft: "auto" }}
                  >
                    Open
                  </a>
                )}
                {canEdit && (
                  <ActionForm
                    action={removeNoticeAttachmentAction}
                    csrfToken={csrfToken}
                    submitLabel="Detach"
                    variant="danger"
                    small
                    inline
                    confirm="Detach this file from the notice? The bytes stay on file for the record, but nothing public will point at them."
                    hidden={{ id: notice.id, documentId: file.documentId, confirm: "true" }}
                  />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
            No file is attached to this notice.
          </p>
        )}

        {canUpload && (
          <ActionForm
            action={addNoticeAttachmentAction}
            csrfToken={csrfToken}
            submitLabel="Attach the files"
            variant="secondary"
            small
            hidden={{ id: notice.id }}
            resetOnSuccess
            className="mt-6 max-w-xl"
          >
            <Field
              uid={`attach-${notice.id}`}
              name="attachments"
              label="Files"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              multiple
              required
              hint="Up to eight files. PDF, JPEG, PNG or WebP — and what the file really is decides how it is served."
            />
            <Field
              uid={`attach-${notice.id}`}
              name="label"
              label="Label for the link"
              defaultValue=""
              hint="For example “Class XII mathematics circular”."
            />
          </ActionForm>
        )}
      </section>

      {principalHas(actor, "notice.delete") && (
        <section className="rule mt-10 pt-8">
          <h2 className="text-[1.15rem]" style={{ color: "var(--alert)" }}>
            Delete
          </h2>
          <p className="mt-1 max-w-prose text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
            Deleting removes the notice and unlinks its attachments. The audit trail keeps the fact that it existed and
            that you removed it, which is why archiving is usually the right answer.
          </p>
          <div className="mt-4">
            <ActionForm
              action={deleteNoticeAction}
              csrfToken={csrfToken}
              submitLabel="Delete this notice"
              variant="danger"
              small
              inline
              confirm={`Delete “${notice.title}” completely? This cannot be undone from the panel.`}
              hidden={{ id: notice.id, confirm: "true" }}
            />
          </div>
        </section>
      )}
    </PanelShell>
  );
}
