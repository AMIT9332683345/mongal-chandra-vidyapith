import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PortalNote } from "@/components/portal-note";
import { InfoGap, SectionHeading } from "@/components/section-heading";
import { NoticeList } from "@/components/notice-list";
import { Prose } from "@/components/prose";
import { formatFileSize, formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import {
  getContentPage,
  getCurrentAcademicYear,
  listClassSubjects,
  listPublicClasses,
  listPublicDocuments,
  listPublicHolidays,
  listPublicNotices,
  listPublishedExams,
  getSettings,
  settingText,
} from "@/server/content/site";

export const revalidate = 300;

export async function generateMetadata() {
  const page = await getContentPage("academics");
  return pageMetadata({
    title: page?.title ?? "Academics",
    description: page?.seoDescription ?? page?.intro,
    path: "/academics",
  });
}

/** Classes and their subjects are read together so the list is one round trip per class. */
async function classesWithSubjects() {
  const rows = await listPublicClasses();
  return Promise.all(
    rows.map(async (row) => ({ ...row, subjects: await listClassSubjects(row.id) })),
  );
}

export default async function AcademicsPage() {
  const [page, settings, academicYear, classes, exams, holidays, documents, academicNotices] =
    await Promise.all([
      getContentPage("academics"),
      getSettings(),
      getCurrentAcademicYear(),
      classesWithSubjects(),
      listPublishedExams(),
      listPublicHolidays(),
      listPublicDocuments("syllabus"),
      listPublicNotices({ limit: 5, categoryKey: "academic" }),
    ]);

  const board = settingText(settings, "school.board");

  return (
    <>
      <PageHeader eyebrow="Academics" title={page?.title ?? "Academics"} intro={page?.intro} />

      <section className="shell grid gap-10 py-14 lg:grid-cols-[1.5fr_1fr]">
        <div>
          {page?.body ? (
            <Prose text={page.body} />
          ) : (
            <InfoGap
              label="Academic programme"
              what="The school writes this page under Content · Pages. The structure below is read live from the classes, subjects and dates configured in the portal."
            />
          )}
          <p className="mt-4 text-[0.95rem]" style={{ color: "var(--ink-secondary)" }}>
            {board
              ? `Curriculum followed: ${board}.`
              : "The board or curriculum followed is not stated until the school confirms it."}
          </p>
        </div>
        <div className="card p-5">
          <p className="eyebrow">Current session</p>
          {academicYear ? (
            <dl className="mt-3 flex flex-col gap-2 text-[0.94rem]">
              <div className="flex justify-between gap-4">
                <dt style={{ color: "var(--ink-muted)" }}>Session</dt>
                <dd className="font-semibold" style={{ color: "var(--ink)" }}>
                  {academicYear.name}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt style={{ color: "var(--ink-muted)" }}>Begins</dt>
                <dd>{formatDate(academicYear.startDate) ?? academicYear.startDate}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt style={{ color: "var(--ink-muted)" }}>Ends</dt>
                <dd>{formatDate(academicYear.endDate) ?? academicYear.endDate}</dd>
              </div>
            </dl>
          ) : (
            <div className="mt-3">
              <InfoGap label="Session" what="No academic year is marked current yet." />
            </div>
          )}
        </div>
      </section>

      <section className="border-t py-14" style={{ borderColor: "var(--line)", background: "var(--canvas-soft)" }}>
        <div className="shell">
          <SectionHeading
            eyebrow="Classes"
            title="Classes and grades offered"
            description="The class range belongs to the school. Expand a class to see the subjects registered against it for the current session."
          />
          {classes.length > 0 ? (
            <ul className="mt-7 flex list-none flex-col gap-3">
              {classes.map((row) => (
                <li key={row.id} className="card">
                  <details className="px-5 py-4">
                    <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-3">
                      <span className="font-[family-name:var(--font-heading)] text-[1.05rem] font-semibold" style={{ color: "var(--ink)" }}>
                        {row.name}
                      </span>
                      <span className="text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
                        {row.typicalAgeYears ? `Typical entry age ${row.typicalAgeYears}` : "Entry age not stated"}
                        {" · "}
                        {row.admissionOpen ? "Admissions open" : "Admissions closed this cycle"}
                      </span>
                    </summary>
                    {row.description && (
                      <p className="mt-3 text-[0.94rem]" style={{ color: "var(--ink-secondary)" }}>
                        {row.description}
                      </p>
                    )}
                    <div className="mt-4 overflow-x-auto">
                      {row.subjects.length > 0 ? (
                        <table>
                          <caption className="sr-only">Subjects taught in {row.name}</caption>
                          <thead>
                            <tr>
                              <th scope="col">Subject</th>
                              <th scope="col">Group</th>
                              <th scope="col">Compulsory</th>
                              <th scope="col">Weekly periods</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.subjects.map((subject) => (
                              <tr key={`${row.id}-${subject.name}`}>
                                <td style={{ color: "var(--ink)" }}>{subject.name}</td>
                                <td>{subject.group ?? "—"}</td>
                                <td>{subject.compulsory ? "Yes" : "Optional"}</td>
                                <td>{subject.weeklyPeriods ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
                          No subjects are registered for this class yet.
                        </p>
                      )}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-6">
              <InfoGap
                label="Classes offered"
                what="The school defines its own classes in the portal. The platform does not assume a class range."
              />
            </div>
          )}
        </div>
      </section>

      <section className="shell py-14">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="Calendar" title="Academic calendar and important dates" />
            {holidays.length > 0 ? (
              <div className="mt-5 overflow-x-auto">
                <table>
                  <caption className="sr-only">Published holidays and closures</caption>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Occasion</th>
                      <th scope="col">Applies to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holidays.map((holiday) => (
                      <tr key={`${holiday.title}-${holiday.startDate}`}>
                        <td className="whitespace-nowrap">
                          {formatDate(holiday.startDate)}
                          {holiday.endDate ? ` – ${formatDate(holiday.endDate)}` : ""}
                        </td>
                        <td style={{ color: "var(--ink)" }}>
                          {holiday.title}
                          {holiday.isEmergency && (
                            <span className="tag ml-2" style={{ borderColor: "var(--urgent)", color: "var(--urgent)" }}>
                              Closure
                            </span>
                          )}
                        </td>
                        <td>{holiday.appliesToAllClasses ? "All classes" : "Selected classes"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-5">
                <InfoGap label="Holiday list" what="Dates are published by the office as they are fixed." />
              </div>
            )}
          </div>

          <div>
            <SectionHeading eyebrow="Examinations" title="Examination schedule" />
            {exams.length > 0 ? (
              <ul className="mt-5 flex list-none flex-col gap-4">
                {exams.map((exam) => (
                  <li key={`${exam.name}-${exam.startDate}`} className="border-l-2 pl-4" style={{ borderColor: "var(--line-strong)" }}>
                    <span className="block font-semibold" style={{ color: "var(--ink)" }}>
                      {exam.name}
                    </span>
                    <span className="block text-[0.88rem]" style={{ color: "var(--ink-muted)" }}>
                      {formatDate(exam.startDate)}
                      {exam.endDate ? ` – ${formatDate(exam.endDate)}` : ""} · {exam.examTypeName} · Session {exam.academicYearName}
                    </span>
                    {exam.instructions && (
                      <span className="mt-1 block text-[0.92rem]" style={{ color: "var(--ink-secondary)" }}>
                        {exam.instructions}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-5">
                <InfoGap
                  label="Examination dates"
                  what="No examination window is published for the current session yet."
                />
              </div>
            )}
            <PortalNote>
              Marks, answer scripts and report cards are released only after an authorised user approves
              publication, and are visible to the linked student and guardians in the portal.
            </PortalNote>
          </div>
        </div>
      </section>

      <section className="border-t py-14" style={{ borderColor: "var(--line)", background: "var(--canvas-soft)" }}>
        <div className="shell grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="Materials" title="Syllabus downloads and study materials" />
            {documents.length > 0 ? (
              <ul className="mt-5 flex list-none flex-col gap-3">
                {documents.map((document) => (
                  <li key={document.id}>
                    <Link
                      href={`/api/downloads/${document.id}`}
                      className="font-semibold no-underline hover:underline"
                      style={{ color: "var(--accent)" }}
                    >
                      {document.title ?? "Untitled document"}
                    </Link>
                    <span className="block text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
                      {document.mimeType}
                      {formatFileSize(document.sizeBytes) ? ` · ${formatFileSize(document.sizeBytes)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-5">
                <InfoGap
                  label="Syllabus documents"
                  what="Files appear here once an administrator marks them publicly downloadable. Private documents are never reachable from a public link."
                />
              </div>
            )}
          </div>
          <div>
            <SectionHeading eyebrow="Board" title="Academic notices" more={{ href: "/notices?category=academic", label: "All notices" }} />
            <div className="mt-5">
              {academicNotices.length > 0 ? (
                <NoticeList notices={academicNotices} compact />
              ) : (
                <EmptyNotice />
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="shell py-14">
        <SectionHeading eyebrow="Regulations" title="Academic regulations, homework and class timetables" />
        <div className="mt-5 grid gap-8 md:grid-cols-2">
          <InfoGap
            label="Academic regulations"
            what="A school's own regulations are published by the administration, as a page or a downloadable document."
          />
          <div>
            <p className="text-[0.94rem]" style={{ color: "var(--ink-secondary)" }}>
              Homework, assignments and class timetables are kept in the portal, where each pupil sees the
              schedule of the class they are enrolled in.
            </p>
            <PortalNote />
          </div>
        </div>
      </section>
    </>
  );
}

function EmptyNotice() {
  return <InfoGap label="Academic notices" what="Nothing is on the board under this category right now." />;
}
