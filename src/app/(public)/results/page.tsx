import { PageHeader } from "@/components/page-header";
import { PortalNote } from "@/components/portal-note";
import { EmptyState, InfoGap, SectionHeading } from "@/components/section-heading";
import { formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import { listPublicAchievements, listPublicMilestones } from "@/server/content/site";

export const revalidate = 600;

export const metadata = pageMetadata({
  title: "Results and achievements",
  description:
    "School-level results, competition finishes and awards published by the school, together with its recorded milestones.",
  path: "/results",
});

const CATEGORY_LABELS: Record<string, string> = {
  academic: "Academic",
  sports: "Sport",
  cultural: "Cultural",
  science: "Science",
  literary: "Literary",
  social: "Community",
};

export default async function ResultsPage() {
  const [achievements, milestones] = await Promise.all([listPublicAchievements(48), listPublicMilestones()]);

  const groups = Object.entries(
    achievements.reduce<Record<string, typeof achievements>>((byCategory, item) => {
      const key = item.category ?? "academic";
      (byCategory[key] ??= []).push(item);
      return byCategory;
    }, {}),
  );

  return (
    <>
      <PageHeader
        eyebrow="Results"
        title="Results and achievements"
        intro="What the school publishes about its cohorts and teams. An individual pupil's marksheet is never on this page."
      />

      <section className="shell py-12">
        <h2 className="text-[1.3rem]">Published achievements</h2>
        {achievements.length === 0 ? (
          <div className="mt-4">
            <InfoGap
              label="Achievements"
              what="Awards, competition finishes and cohort statistics are entered from a verified result set and marked confirmed before they appear. Nothing is estimated for the sake of a full page."
            />
          </div>
        ) : (
          <div className="mt-5 space-y-10">
            {groups.map(([category, items]) => (
              <div key={category}>
                <SectionHeading eyebrow="Category" title={CATEGORY_LABELS[category] ?? category} />
                <div className="mt-4 overflow-x-auto">
                  <table>
                    <caption className="sr-only">
                      Published {CATEGORY_LABELS[category] ?? category} achievements, most recent first
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Achievement</th>
                        <th scope="col">Date</th>
                        <th scope="col">Event or examination</th>
                        <th scope="col">Awarding body</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, index) => (
                        <tr key={`${item.title}-${index}`}>
                          <td>
                            <span className="font-semibold" style={{ color: "var(--ink)" }}>
                              {item.title}
                            </span>
                            {item.description && (
                              <span className="block text-[0.9rem]" style={{ color: "var(--ink-secondary)" }}>
                                {item.description}
                              </span>
                            )}
                          </td>
                          <td>{formatDate(item.achievedOn) ?? "Date not recorded"}</td>
                          <td>{item.eventName ?? "—"}</td>
                          <td>{item.awardingBody ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rule mt-14 pt-10">
          <h2 className="text-[1.3rem]">Examination statistics and individual results</h2>
          <p className="mt-2 text-[0.98rem]" style={{ color: "var(--ink-secondary)" }}>
            Marks, grade cards and subject-level statistics belong to the pupil and the family. They are released to a
            parent or guardian through the portal once the school has approved publication; a result is not visible on
            the public site even after it is issued.
          </p>
          <PortalNote>
            Signed-in parents see the results of their own children only, and staff see the classes they are
            responsible for.
          </PortalNote>
        </div>

        <div className="rule mt-14 pt-10">
          <h2 className="text-[1.3rem]">School milestones</h2>
          {milestones.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No milestones published"
                note="Dates and achievements in the school's history are entered only once the office has verified them."
              />
            </div>
          ) : (
            <ol className="mt-5 list-none p-0">
              {milestones.map((milestone, index) => (
                <li
                  key={`${milestone.periodLabel}-${index}`}
                  className="grid gap-1 border-l pl-5 sm:grid-cols-[7rem_1fr]"
                  style={{ borderColor: "var(--line-strong)" }}
                >
                  <span className="text-[0.9rem] font-semibold" style={{ color: "var(--accent)" }}>
                    {milestone.periodLabel}
                  </span>
                  <span>
                    <span className="block font-semibold" style={{ color: "var(--ink)" }}>
                      {milestone.title}
                    </span>
                    {milestone.description && (
                      <span className="block text-[0.94rem]" style={{ color: "var(--ink-secondary)" }}>
                        {milestone.description}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </>
  );
}
