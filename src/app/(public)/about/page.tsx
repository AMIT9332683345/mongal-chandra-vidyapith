import { CampusPhoto } from "@/components/campus-photo";
import { InfoGap, SectionHeading } from "@/components/section-heading";
import { PageHeader } from "@/components/page-header";
import { Prose } from "@/components/prose";
import { pageMetadata } from "@/lib/metadata";
import {
  getContentPage,
  getSettings,
  getSchoolName,
  listPublicAchievements,
  listPublicMilestones,
  listPublicFacilities,
  settingText,
} from "@/server/content/site";

export const revalidate = 300;

export async function generateMetadata() {
  const page = await getContentPage("about");
  return pageMetadata({
    title: page?.title ?? "About the school",
    description: page?.seoDescription ?? page?.intro,
    path: "/about",
  });
}

/**
 * Every block on this page is either a row the school has published or an
 * explicit gap. Founding year, vision, philosophy and milestones are not
 * written here, because an institution's public history cannot be an
 * approximation.
 */
export default async function AboutPage() {
  const [schoolName, settings, page, milestones, facilities, achievements] = await Promise.all([
    getSchoolName(),
    getSettings(),
    getContentPage("about"),
    listPublicMilestones(),
    listPublicFacilities(),
    listPublicAchievements(8),
  ]);

  const establishedYear = settingText(settings, "school.established_year");
  const vision = settingText(settings, "school.vision");
  const mission = settingText(settings, "school.mission");
  const values = settingText(settings, "school.values");
  const board = settingText(settings, "school.board");
  const principalName = settingText(settings, "school.principal_name");
  const principalMessage = settingText(settings, "school.principal_message");

  return (
    <>
      <PageHeader
        eyebrow="About"
        title={page?.title ?? `About ${schoolName}`}
        intro={page?.intro}
      />

      <section className="shell grid gap-12 py-14 lg:grid-cols-[1.5fr_1fr]">
        <div>
          {page?.body ? (
            <Prose text={page.body} className="text-[1rem] leading-[1.8]" />
          ) : (
            <InfoGap
              label="School introduction"
              what="This page is written by the school under Content · Pages. Nothing about the institution's character is drafted on its behalf."
            />
          )}
        </div>
        <div>
          <CampusPhoto caption="The campus, as photographed for this website." />
        </div>
      </section>

      <section className="border-y py-14" style={{ borderColor: "var(--line)", background: "var(--canvas-soft)" }}>
        <div className="shell grid gap-10 md:grid-cols-3">
          <div>
            <p className="eyebrow">Vision</p>
            {vision ? <p className="mt-2">{vision}</p> : <div className="mt-2"><InfoGap label="Vision" what="Awaiting the school's own statement." /></div>}
          </div>
          <div>
            <p className="eyebrow">Mission</p>
            {mission ? <p className="mt-2">{mission}</p> : <div className="mt-2"><InfoGap label="Mission" what="Awaiting the school's own statement." /></div>}
          </div>
          <div>
            <p className="eyebrow">Values</p>
            {values ? <p className="mt-2">{values}</p> : <div className="mt-2"><InfoGap label="Values" what="Awaiting the school's own statement." /></div>}
          </div>
        </div>
      </section>

      <section className="shell py-14">
        <SectionHeading eyebrow="History" title="History and establishment" />
        <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <p className="text-[0.98rem]" style={{ color: "var(--ink-secondary)" }}>
            {establishedYear
              ? `${schoolName} was established in ${establishedYear}.`
              : "The school has not confirmed a year of establishment, so none is printed. An approximate founding date on a public page would misreport the institution's own record."}
          </p>
          {milestones.length > 0 ? (
            <ol className="m-0 flex list-none flex-col gap-5 p-0">
              {milestones.map((milestone) => (
                <li key={`${milestone.periodLabel}-${milestone.title}`} className="border-l-2 pl-5" style={{ borderColor: "var(--line-strong)" }}>
                  <span className="block text-[0.82rem] tabular-nums" style={{ color: "var(--accent)" }}>
                    {milestone.periodLabel}
                  </span>
                  <span className="block font-[family-name:var(--font-heading)] font-semibold" style={{ color: "var(--ink)" }}>
                    {milestone.title}
                  </span>
                  {milestone.description && (
                    <span className="mt-1 block text-[0.93rem]" style={{ color: "var(--ink-secondary)" }}>
                      {milestone.description}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <InfoGap label="Milestones" what="Recorded by the school under Content · Milestones before they appear here." />
          )}
        </div>
      </section>

      <section className="border-t py-14" style={{ borderColor: "var(--line)" }}>
        <div className="shell grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="Approach" title="Educational philosophy and academic approach" />
            <div className="mt-5">
              <p className="text-[0.95rem]" style={{ color: "var(--ink-secondary)" }}>
                {board
                  ? `The school follows ${board}.`
                  : "The curriculum or board followed by the school has not been stated; the platform does not assume one."}
              </p>
              <div className="mt-4">
                <InfoGap
                  label="Teaching approach"
                  what="Written by the academic coordinator, alongside the class-wise subjects published on the Academics page."
                />
              </div>
            </div>
          </div>
          <div>
            <SectionHeading eyebrow="Campus" title="School infrastructure" />
            {facilities.length > 0 ? (
              <ul className="mt-5 flex list-none flex-col gap-2.5">
                {facilities.map((facility) => (
                  <li key={facility.slug}>
                    <span className="font-semibold" style={{ color: "var(--ink)" }}>
                      {facility.name}
                    </span>
                    {(facility.summary || facility.detail) && (
                      <span className="block text-[0.93rem]" style={{ color: "var(--ink-secondary)" }}>
                        {facility.summary ?? facility.detail}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-5">
                <InfoGap label="Infrastructure" what="Each facility is confirmed by the school before it is claimed on this site." />
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="border-t py-14" style={{ borderColor: "var(--line)", background: "var(--canvas-soft)" }}>
        <div className="shell grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="eyebrow">From the Principal</p>
            <h2 className="mt-1.5">Principal&rsquo;s message</h2>
            {principalMessage ? (
              <Prose text={principalMessage} className="mt-4" />
            ) : (
              <div className="mt-4">
                <InfoGap label="Principal&rsquo;s message" what="Published once the principal supplies the text." />
              </div>
            )}
            {principalName && (
              <p className="mt-4 font-semibold" style={{ color: "var(--ink)" }}>
                {principalName}
              </p>
            )}
          </div>
          <div>
            <SectionHeading eyebrow="Recognition" title="Achievements" more={{ href: "/results", label: "All achievements" }} />
            {achievements.length > 0 ? (
              <ul className="mt-4 flex list-none flex-col gap-3">
                {achievements.slice(0, 5).map((achievement) => (
                  <li key={`${achievement.title}-${achievement.achievedOn ?? ""}`} className="border-b pb-3 last:border-b-0" style={{ borderColor: "var(--line)" }}>
                    <span className="font-semibold" style={{ color: "var(--ink)" }}>
                      {achievement.title}
                    </span>
                    {achievement.awardingBody && (
                      <span className="block text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
                        {achievement.awardingBody}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4">
                <InfoGap label="Achievements" what="Only verified awards and result statistics are published." />
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="shell py-14">
        <SectionHeading eyebrow="Record" title="Official school information" />
        <div className="mt-5 overflow-x-auto">
          <table>
            <caption className="sr-only">Information confirmed by the school</caption>
            <tbody>
              {[
                ["Official name", settingText(settings, "school.name")],
                ["Name in the local language", settingText(settings, "school.name_local")],
                ["Year established", establishedYear],
                ["Curriculum or board", board],
                ["Principal", principalName],
                ["Postal address", settingText(settings, "school.address")],
                ["Office telephone", settingText(settings, "school.phone")],
                ["Official email", settingText(settings, "school.email")],
              ].map(([label, value]) => (
                <tr key={label as string}>
                  <th scope="row" className="w-56 font-medium">
                    {label}
                  </th>
                  <td style={{ color: value ? "var(--ink-secondary)" : "var(--ink-muted)" }}>
                    {value ?? "Not yet supplied by the school"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
