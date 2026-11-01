import Link from "next/link";
import { ActionForm } from "@/components/cms-form";
import { EmptyState } from "@/components/section-heading";
import { PanelShell } from "@/components/panel-shell";
import { listNoticesForAdmin } from "@/server/content/admin";
import { changeNoticeStatusAction, deleteNoticeAction } from "@/server/content/actions";
import { makeCsrfToken, principalHas } from "@/server/auth/session";
import { requirePanel } from "@/server/auth/gate";
import { pageMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Notices",
  description: "The notice board, including the drafts nobody else can see.",
  path: "/portal/content/notices",
  noIndex: true,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  unpublished: "Taken down",
  archived: "Archived",
};

function shortDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`));
}

export default async function NoticesPanelPage() {
  const actor = await requirePanel("notice.view", "/portal/content/notices");
  const notices = await listNoticesForAdmin();
  const csrfToken = makeCsrfToken(actor.sessionId);
  const canPublish = principalHas(actor, "notice.publish");
  const canDelete = principalHas(actor, "notice.delete");

  return (
    <PanelShell
      actor={actor}
      active="/portal/content/notices"
      eyebrow="Content panel"
      title="Notice board"
      intro="A notice is drafted, then published. The two steps need two permissions, so an unfinished notice cannot reach the public board by accident."
    >
      <p className="mb-6">
        <Link href="/portal/content/notices/new" className="button button-gold">
          Draft a new notice
        </Link>
      </p>

      {notices.length === 0 ? (
        <EmptyState
          title="No notices yet"
          note="The public board shows a stated absence rather than an invented announcement, so the site is honest until the office writes the first one."
        />
      ) : (
        <div className="overflow-x-auto">
          <table>
            <caption className="sr-only">Every notice, its state, and what may be done to it</caption>
            <thead>
              <tr>
                <th scope="col">Notice</th>
                <th scope="col">State</th>
                <th scope="col">Category</th>
                <th scope="col">Shows from</th>
                <th scope="col">Until</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {notices.map((notice) => (
                <tr key={notice.id}>
                  <th scope="row" className="text-left font-semibold">
                    <Link href={`/portal/content/notices/${notice.id}`}>{notice.title}</Link>
                    {notice.pinned && (
                      <span className="tag ml-2" style={{ borderColor: "var(--gold)", color: "var(--gold-ink)" }}>
                        pinned
                      </span>
                    )}
                    <span className="block text-[0.82rem] font-normal" style={{ color: "var(--ink-muted)" }}>
                      {notice.audience === "public"
                        ? `/${notice.slug} · public board`
                        : notice.audience === "teachers"
                          ? "teachers only · not on the website"
                          : "staff only · not on the website"}
                    </span>
                  </th>
                  <td>
                    <span
                      className="tag"
                      style={
                        notice.status === "published"
                          ? { borderColor: "var(--accent)", color: "var(--accent)" }
                          : notice.status === "scheduled"
                            ? { borderColor: "var(--gold)", color: "var(--gold-ink)" }
                            : undefined
                      }
                    >
                      {STATUS_LABEL[notice.status] ?? notice.status}
                    </span>
                  </td>
                  <td>{notice.categoryName ?? "—"}</td>
                  <td>{shortDate(notice.issuedOn)}</td>
                  <td>{shortDate(notice.expiresOn)}</td>
                  <td>
                    <div className="flex flex-wrap items-center gap-2">
                      {notice.status !== "published" && canPublish ? (
                        <ActionForm
                          action={changeNoticeStatusAction}
                          csrfToken={csrfToken}
                          submitLabel="Publish"
                          variant="secondary"
                          small
                          inline
                          hidden={{ id: notice.id, intent: "publish" }}
                        />
                      ) : null}
                      {notice.status === "published" && canPublish ? (
                        <ActionForm
                          action={changeNoticeStatusAction}
                          csrfToken={csrfToken}
                          submitLabel="Take down"
                          variant="secondary"
                          small
                          inline
                          hidden={{ id: notice.id, intent: "unpublish" }}
                        />
                      ) : null}
                      {notice.status !== "archived" && notice.status !== "published" && canPublish ? (
                        <ActionForm
                          action={changeNoticeStatusAction}
                          csrfToken={csrfToken}
                          submitLabel="Archive"
                          variant="secondary"
                          small
                          inline
                          note="Kept for the record, off every board."
                          hidden={{ id: notice.id, intent: "archive" }}
                        />
                      ) : null}
                      {canDelete ? (
                        <ActionForm
                          action={deleteNoticeAction}
                          csrfToken={csrfToken}
                          submitLabel="Delete"
                          variant="danger"
                          small
                          inline
                          confirm={`Delete “${notice.title}” completely? Its attachments are unlinked and it cannot be recovered.`}
                          hidden={{ id: notice.id, confirm: "true" }}
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

      <p className="pending mt-8">
        <strong>Only ever taken down, never deleted.</strong> A notice that announced an exam date is a record of what
        the school told families and when. Deleting it erases that; archiving keeps it out of the public list and
        inside the audit trail, where the date it was published and the person who published it are both still readable.
      </p>
    </PanelShell>
  );
}
