import { ActionForm } from "@/components/cms-form";
import { Field } from "@/components/field";
import { PanelShell } from "@/components/panel-shell";
import { EmptyState } from "@/components/section-heading";
import { pageMetadata } from "@/lib/metadata";
import { makeCsrfToken } from "@/server/auth/session";
import { requirePanel } from "@/server/auth/gate";
import { listAchievementsForAdmin } from "@/server/content/library";
import {
  changeAchievementStatusAction,
  deleteAchievementAction,
  saveAchievementAction,
} from "@/server/content/library-actions";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Achievements",
  description: "Awards and results published on the school's behalf.",
  path: "/portal/content/achievements",
  noIndex: true,
});

const CATEGORY_OPTIONS = [
  { value: "academic", label: "Academic" },
  { value: "sports", label: "Sports" },
  { value: "cultural", label: "Cultural" },
  { value: "institutional", label: "Institutional" },
];

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  unpublished: "Taken down",
  archived: "Archived",
};

function Fields({ prefix, row }: { prefix: string; row?: Awaited<ReturnType<typeof listAchievementsForAdmin>>[number] }) {
  return (
    <div className="grid gap-x-6 sm:grid-cols-2">
      <Field uid={prefix} name="title" label="What was achieved" required defaultValue={row?.title} />
      <Field uid={prefix} name="category" label="Category" as="select" options={CATEGORY_OPTIONS} defaultValue={row?.category ?? "academic"} />
      <Field uid={prefix} name="achievedOn" label="Date" type="date" defaultValue={row?.achievedOn} />
      <Field uid={prefix} name="eventName" label="Event" defaultValue={row?.eventName} />
      <Field uid={prefix} name="awardingBody" label="Awarded by" defaultValue={row?.awardingBody} />
      <div className="sm:col-span-2">
        <Field uid={prefix} name="description" label="Description" as="textarea" rows={3} defaultValue={row?.description} />
      </div>
      <div className="sm:col-span-2">
        <Field
          uid={prefix}
          name="confirmed"
          label="Checked against a verified result record."
          as="checkbox"
          defaultChecked={row?.confirmed ?? false}
          hint="An unconfirmed result cannot be published."
        />
      </div>
    </div>
  );
}

export default async function AchievementsPanelPage() {
  const actor = await requirePanel("achievement.edit", "/portal/content/achievements");
  const rows = await listAchievementsForAdmin();
  const csrfToken = makeCsrfToken(actor.sessionId);

  return (
    <PanelShell
      actor={actor}
      active="/portal/content/achievements"
      eyebrow="Content panel"
      title="Achievements"
      intro="School-level awards and results, recorded only from a verified set. A pupil's individual marks never appear on the public site."
    >
      <section>
        <h2 className="text-[1.15rem]">Record an achievement</h2>
        <ActionForm action={saveAchievementAction} csrfToken={csrfToken} submitLabel="Save as draft" resetOnSuccess>
          <Fields prefix="new-achievement" />
        </ActionForm>
      </section>

      <section className="rule mt-10 pt-8">
        <h2 className="text-[1.15rem]">Every achievement</h2>
        {rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="Nothing recorded yet" note="The results page states the absence rather than inventing an award." />
          </div>
        ) : (
          <ul className="mt-4 space-y-4">
            {rows.map((row) => (
              <li key={row.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold" style={{ color: "var(--ink)" }}>{row.title}</p>
                    <p className="mt-1 text-[0.86rem]" style={{ color: "var(--ink-muted)" }}>
                      {[row.category, row.achievedOn, row.eventName, row.awardingBody].filter(Boolean).join(" · ")}
                    </p>
                    <p className="mt-2 flex flex-wrap gap-2 text-[0.78rem]">
                      <span className="tag" style={row.status === "published" ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}>
                        {STATUS_LABEL[row.status] ?? row.status}
                      </span>
                      <span className="tag" style={row.confirmed ? { borderColor: "var(--accent)", color: "var(--accent)" } : { borderColor: "var(--alert)", color: "var(--alert)" }}>
                        {row.confirmed ? "Verified" : "Unverified"}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ActionForm
                      action={changeAchievementStatusAction}
                      csrfToken={csrfToken}
                      submitLabel={row.status === "published" ? "Take down" : "Publish"}
                      variant={row.status === "published" ? "secondary" : "gold"}
                      small
                      inline
                      hidden={{ id: row.id, intent: row.status === "published" ? "unpublish" : "publish" }}
                    />
                    <ActionForm
                      action={deleteAchievementAction}
                      csrfToken={csrfToken}
                      submitLabel="Delete"
                      variant="danger"
                      small
                      inline
                      confirm={`Delete “${row.title}”?`}
                      hidden={{ id: row.id, confirm: "true" }}
                    />
                  </div>
                </div>
                <details className="mt-4">
                  <summary className="cursor-pointer text-[0.88rem] font-semibold" style={{ color: "var(--accent)" }}>
                    Edit
                  </summary>
                  <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--line)" }}>
                    <ActionForm action={saveAchievementAction} csrfToken={csrfToken} submitLabel="Save changes" hidden={{ id: row.id }}>
                      <Fields prefix={`row-${row.id}`} row={row} />
                    </ActionForm>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PanelShell>
  );
}
