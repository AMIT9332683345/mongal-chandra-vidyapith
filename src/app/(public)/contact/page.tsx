import { Field, SubmitRow } from "@/components/field";
import { JsonForm } from "@/components/json-form";
import { FormNotice, FormTokens } from "@/components/form-tokens";
import { PageHeader } from "@/components/page-header";
import { InfoGap, SectionHeading } from "@/components/section-heading";
import { pageMetadata } from "@/lib/metadata";
import { currentFormToken } from "@/server/http/respond";
import {
  getSchoolName,
  getSettings,
  listPublicClasses,
  listPublishedFaqs,
  listVisibleSocialLinks,
  settingText,
} from "@/server/content/site";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Contact the school",
  description:
    "The school office address, telephone, email and hours, with contact and admission enquiry forms and answers to common questions.",
  path: "/contact",
});

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const noticeCode =
    typeof query.form_error === "string"
      ? query.form_error
      : query.form_status === "sent"
        ? "sent"
        : null;

  const [token, schoolName, settings, classes, faqs, socialLinks] = await Promise.all([
    currentFormToken(),
    getSchoolName(),
    getSettings(),
    listPublicClasses(),
    listPublishedFaqs(),
    listVisibleSocialLinks(),
  ]);

  const address = settingText(settings, "school.address");
  const phone = settingText(settings, "school.phone");
  const email = settingText(settings, "school.email");
  const hours = settingText(settings, "school.office_hours");
  const mapUrl = settingText(settings, "school.map_url");

  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="Get in touch"
        intro={`Written answers from the office of ${schoolName}, and the forms the school reads.`}
      />

      <section className="shell grid gap-12 py-12 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <h2 className="text-[1.2rem]">The school office</h2>

          <address className="mt-3 not-italic text-[0.98rem]" style={{ color: "var(--ink-secondary)" }}>
            {address ? (
              <>
                <strong className="block" style={{ color: "var(--ink)" }}>
                  Address
                </strong>
                <span className="block whitespace-pre-line">{address}</span>
              </>
            ) : (
              <span className="pending mt-2 block">
                <strong>Address not published.</strong> The school supplies its own postal address; it is never written
                for the site.
              </span>
            )}

            <span className="rule mt-4 block pt-4">
              <strong className="block" style={{ color: "var(--ink)" }}>
                Telephone
              </strong>
              {phone ? (
                <a href={`tel:${phone.replace(/\s+/g, "")}`} className="underline">
                  {phone}
                </a>
              ) : (
                <span className="pending mt-2 block">
                  <strong>Telephone not published.</strong> Awaiting the school&rsquo;s office number.
                </span>
              )}
            </span>

            <span className="rule mt-4 block pt-4">
              <strong className="block" style={{ color: "var(--ink)" }}>
                Email
              </strong>
              {email ? (
                <a href={`mailto:${email}`} className="underline">
                  {email}
                </a>
              ) : (
                <span className="pending mt-2 block">
                  <strong>Email not published.</strong> Awaiting the school&rsquo;s official address.
                </span>
              )}
            </span>

            <span className="rule mt-4 block pt-4">
              <strong className="block" style={{ color: "var(--ink)" }}>
                Office hours
              </strong>
              {hours ?? (
                <span className="pending mt-2 block">
                  <strong>Office hours not published.</strong> Supplied by the school.
                </span>
              )}
            </span>
          </address>

          <div className="mt-6">
            {mapUrl ? (
              <a href={mapUrl} className="button button-secondary" rel="noreferrer">
                Open the campus map
              </a>
            ) : (
              <InfoGap
                label="Map"
                what="The school's own map link is added in the settings. An approximate location is not published in its place."
              />
            )}
          </div>

          {socialLinks.length > 0 && (
            <div className="mt-8">
              <h3 className="text-[1rem]">Elsewhere</h3>
              <ul className="mt-2 list-none p-0">
                {socialLinks.map((link) => (
                  <li key={link.platform}>
                    <a href={link.url} className="underline" rel="noreferrer me">
                      {link.label ?? link.platform}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div>
          <SectionHeading
            eyebrow="Write to us"
            title="General enquiry"
            description="A message here is recorded for the office to answer. It is not sent to any other family."
          />

          <div className="mt-5">
            {noticeCode && <FormNotice code={noticeCode} />}
            <JsonForm action="/api/enquiries" successMessage="Thank you. Your message is with the school office.">
              <Field uid="gen" name="name" label="Your name" required autoComplete="name" />
              <Field uid="gen" name="email" label="Email" type="email" required autoComplete="email" hint="So the office can reply." />
              <Field uid="gen" name="phone" label="Telephone" type="tel" autoComplete="tel" hint="Optional." />
              <Field uid="gen" name="subject" label="Subject" hint="Optional — a few words for the office log." />
              <Field
                uid="gen"
                name="message"
                label="Message"
                as="textarea"
                rows={6}
                required
                hint="At least a sentence or two, so the right person can answer."
              />
              <input type="hidden" name="kind" value="general" readOnly />
              <input type="hidden" name="sourcePage" value="/contact" readOnly />
              <FormTokens token={token} uid="gen" />
              <SubmitRow label="Send the message" />
            </JsonForm>
          </div>

          <div className="rule mt-12 pt-10">
            <SectionHeading
              eyebrow="Admissions"
              title="Admission enquiry"
              description="A question about a class, the process or the papers needed. To apply, use the application form."
            />
            <div className="mt-5">
              <JsonForm action="/api/enquiries" successMessage="Your enquiry is with the admission desk.">
                <Field uid="adm" name="name" label="Your name" required autoComplete="name" />
                <Field uid="adm" name="email" label="Email" type="email" required autoComplete="email" />
                <Field uid="adm" name="phone" label="Telephone" type="tel" autoComplete="tel" hint="Optional." />
                <Field
                  uid="adm"
                  name="subject"
                  as="select"
                  label="Class you are asking about"
                  options={[
                    { value: "General admission enquiry", label: "Any class / general" },
                    ...classes.map((item) => ({ value: item.name, label: item.name })),
                  ]}
                />
                <Field uid="adm" name="message" label="Your question" as="textarea" rows={5} required />
                <input type="hidden" name="kind" value="admission" readOnly />
                <input type="hidden" name="sourcePage" value="/contact" readOnly />
                <FormTokens token={token} uid="adm" />
                <SubmitRow label="Send the enquiry" />
              </JsonForm>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t py-12" style={{ borderColor: "var(--line)", background: "var(--canvas-soft)" }}>
        <div className="shell-narrow">
          <SectionHeading eyebrow="Questions" title="Asked often" />
          {faqs.length === 0 ? (
            <div className="mt-5">
              <InfoGap label="Questions and answers" what="The school writes these itself, so the page does not guess at an answer." />
            </div>
          ) : (
            <dl className="mt-5">
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
          )}
        </div>
      </section>
    </>
  );
}
