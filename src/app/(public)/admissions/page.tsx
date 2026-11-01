import Link from "next/link";
import { FormNotice } from "@/components/form-tokens";
import { PageHeader } from "@/components/page-header";
import { Prose } from "@/components/prose";
import { EmptyState, InfoGap, SectionHeading } from "@/components/section-heading";
import { formatFileSize, formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import {
  getContentPage,
  getCurrentAcademicYear,
  getSettings,
  listPublicClasses,
  listPublicDocuments,
  listPublicNotices,
  listPublishedFaqs,
  settingText,
} from "@/server/content/site";

export const revalidate = 300;

export async function generateMetadata() {
  const page = await getContentPage("admissions");
  return pageMetadata({
    title: page?.title ?? "Admissions",
    description: page?.seoDescription ?? page?.intro,
    path: "/admissions",
  });
}

export default async function AdmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const noticeCode = typeof query.form_error === "string" ? query.form_error : null;

  const [page, settings, academicYear, classes, documents, notices, faqs] = await Promise.all([
    getContentPage("admissions"),
    getSettings(),
    getCurrentAcademicYear(),
    listPublicClasses(),
    listPublicDocuments("admission"),
    listPublicNotices({ categoryKey: "admission", limit: 6 }),
    listPublishedFaqs("admission"),
  ]);

  const openFrom = settingText(settings, "admission.open_from") ?? academicYear?.admissionOpenFrom ?? null;
  const openTo = settingText(settings, "admission.open_to") ?? academicYear?.admissionOpenTo ?? null;
  const contactNote = settingText(settings, "admission.contact_note");
  const openingClasses = classes.filter((item) => item.admissionOpen);

  return (
    <>
      <PageHeader
        eyebrow="Admissions"
        title={page?.title ?? "Admissions"}
        intro={page?.intro}
      />

      <section className="shell py-12">
        {noticeCode && <FormNotice code={noticeCode} />}

        <div className="grid gap-12 lg:grid-cols-[1.6fr_1fr]">
          <div>
            {page?.body ? (
              <Prose text={page.body} />
            ) : (
              <InfoGap
                label="Admission information"
                what="The school writes its own admission notes — eligibility, the papers it asks for, and how a file is considered. They appear here once published from the dashboard. The platform does not compose them."
              />
            )}

            <div className="mt-12">
              <SectionHeading eyebrow="Classes" title="Where admission is open" />
              {openingClasses.length === 0 ? (
                <div className="mt-4">
                  <InfoGap
                    label="Classes"
                    what="The school marks which classes hold places. Until it does, no class range is claimed here."
                  />
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table>
                    <caption className="sr-only">Classes with admission currently open</caption>
                    <thead>
                      <tr>
                        <th scope="col">Class</th>
                        <th scope="col">Typical age</th>
                        <th scope="col">Note from the school</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openingClasses.map((item) => (
                        <tr key={item.id}>
                          <td className="font-semibold" style={{ color: "var(--ink)" }}>
                            {item.name}
                          </td>
                          <td>{item.typicalAgeYears ? `${item.typicalAgeYears} years` : "Not published"}</td>
                          <td>{item.description ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-12">
              <SectionHeading eyebrow="Forms and papers" title="Downloadable documents" />
              {documents.length === 0 ? (
                <div className="mt-4">
                  <InfoGap
                    label="Downloadable forms"
                    what="A prospectus, instruction sheet or offline form appears here as soon as the school publishes one."
                  />
                </div>
              ) : (
                <ul className="mt-4 list-none p-0">
                  {documents.map((document) => (
                    <li key={document.id} className="rule py-3 first:border-t-0 first:pt-0">
                      <a href={`/api/downloads/${document.id}`} className="font-semibold underline">
                        {document.title ?? "Untitled document"}
                      </a>
                      <span className="block text-[0.88rem]" style={{ color: "var(--ink-muted)" }}>
                        {document.mimeType}
                        {formatFileSize(document.sizeBytes) ? ` · ${formatFileSize(document.sizeBytes)}` : ""}
                      </span>
                      {document.description && (
                        <span className="block text-[0.92rem]" style={{ color: "var(--ink-secondary)" }}>
                          {document.description}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {faqs.length > 0 && (
              <div className="mt-12">
                <SectionHeading eyebrow="Questions" title="About admission" />
                <dl className="mt-4">
                  {faqs.map((faq, index) => (
                    <div key={`${faq.question}-${index}`} className="rule py-4 first:border-t-0 first:pt-0">
                      <dt className="font-semibold" style={{ color: "var(--ink)" }}>
                        {faq.question}
                      </dt>
                      <dd className="mt-1 text-[0.96rem]" style={{ color: "var(--ink-secondary)" }}>
                        {faq.answer}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>

          <aside>
            <div className="card p-6">
              <h2 className="text-[1.1rem]">Apply</h2>
              <p className="mt-2 text-[0.95rem]" style={{ color: "var(--ink-secondary)" }}>
                The form takes about ten minutes. You will be given a reference number to keep.
              </p>
              <p className="mt-4 flex flex-col gap-3">
                <Link href="/admissions/apply" className="button button-primary">
                  Start an application
                </Link>
                <Link href="/admissions/status" className="button button-secondary">
                  Check an application
                </Link>
                <Link href="/contact" className="button button-secondary">
                  Ask the admission desk
                </Link>
              </p>
            </div>

            <div className="mt-6">
              <SectionHeading eyebrow="Dates" title="Important dates" />
              <table className="mt-3">
                <caption className="sr-only">Published admission dates</caption>
                <tbody>
                  <tr>
                    <th scope="row">Applications open</th>
                    <td>{openFrom ? formatDate(openFrom) ?? openFrom : "Not published"}</td>
                  </tr>
                  <tr>
                    <th scope="row">Applications close</th>
                    <td>{openTo ? formatDate(openTo) ?? openTo : "Not published"}</td>
                  </tr>
                  <tr>
                    <th scope="row">Academic session</th>
                    <td>{academicYear?.name ?? "Not published"}</td>
                  </tr>
                </tbody>
              </table>
              {contactNote && (
                <p className="mt-4 text-[0.92rem]" style={{ color: "var(--ink-secondary)" }}>
                  {contactNote}
                </p>
              )}
            </div>

            <div className="mt-8">
              <SectionHeading
                eyebrow="Board"
                title="Admission notices"
                more={{ href: "/notices?category=admission", label: "All notices" }}
              />
              {notices.length === 0 ? (
                <div className="mt-4">
                  <EmptyState title="No admission notices" note="Circulars appear here the moment the school publishes them." />
                </div>
              ) : (
                <ul className="mt-3 list-none p-0">
                  {notices.map((notice) => (
                    <li key={notice.id} className="rule py-2.5 first:border-t-0 first:pt-0">
                      <Link href={`/notices/${notice.slug}`} className="text-[0.95rem] font-semibold underline">
                        {notice.title}
                      </Link>
                      <span className="block text-[0.84rem]" style={{ color: "var(--ink-muted)" }}>
                        {formatDate(notice.issuedOn)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
