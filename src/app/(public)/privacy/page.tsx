import { PageHeader } from "@/components/page-header";
import { Prose } from "@/components/prose";
import { SectionHeading, InfoGap } from "@/components/section-heading";
import { formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import { getContentPage, getSettings, settingText } from "@/server/content/site";
import { env } from "@/server/config/env";

export const revalidate = 600;

export async function generateMetadata() {
  const page = await getContentPage("privacy");
  return pageMetadata({
    title: page?.title ?? "Privacy notice",
    description:
      page?.seoDescription ??
      page?.intro ??
      "What this website collects from visitors and families, who can see a pupil's records, and how to ask for a correction.",
    path: "/privacy",
  });
}

/**
 * The first section is the school's own wording whenever it has published any.
 * The rest describes how this software actually behaves — the cookies it sets,
 * the fields its forms accept, the checks its endpoints run — which is a fact
 * about the code rather than a promise the school has to make. Retention
 * periods and the data-protection contact belong to the school and are shown
 * as gaps until it decides them.
 */
export default async function PrivacyPage() {
  const [page, settings] = await Promise.all([getContentPage("privacy"), getSettings()]);

  const address = settingText(settings, "school.address");
  const email = settingText(settings, "school.email");
  const phone = settingText(settings, "school.phone");
  const dpo = settingText(settings, "school.data_protection_contact");

  const policyRows = [
    {
      record: "Admission applications and the documents attached to them",
      held: "From the moment a family submits the form until the school decides the case, and afterwards for as long as the school's own policy says.",
      who: "Admission staff, the principal and administrators. Never listed on a public page.",
    },
    {
      record: "Photographs of pupils",
      held: "Until the family withdraws consent or asks for the image to be taken down.",
      who: "Only albums the school has marked consent-cleared appear in the public gallery; every other image stays inside the portal.",
    },
    {
      record: "Marks, attendance and fee statements",
      held: "According to the academic record the school keeps.",
      who: "The pupil, their linked guardians, the teachers assigned to the class, and staff whose role grants the module.",
    },
    {
      record: "Contact-form enquiries",
      held: "Until the office has answered and closed the enquiry.",
      who: "Office staff and administrators.",
    },
    {
      record: "Sign-in and sensitive-action logs",
      held: "Kept so the school can investigate an incident.",
      who: "Administrators only. The log stores a hashed IP address, not the address itself.",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title={page?.title ?? "Privacy notice"}
        intro={page?.intro ?? "What this website collects, who is allowed to read it, and how to ask for a change."}
      />

      {page?.body && (
        <section className="shell py-12">
          <Prose text={page.body} className="max-w-3xl" />
          {page.publishedAt && (
            <p className="mt-4 text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
              Published by the school on {formatDate(page.publishedAt)}.
            </p>
          )}
        </section>
      )}

      <section className="shell py-12" style={{ borderTop: page?.body ? "1px solid var(--line)" : undefined }}>
        <SectionHeading
          eyebrow="Public website"
          title="What a visitor gives this site"
          description="The public pages themselves store nothing about you. Three forms do collect information, and each of them tells you on the page what it asks for."
        />
        <div className="mt-5 max-w-3xl">
          <ul className="space-y-2 pl-5">
            <li>
              <strong>Contact and admission enquiries.</strong> Name, email address and, only if you choose to fill
              them in, a telephone number and the class you are asking about. Your message is stored so the office can
              reply.
            </li>
            <li>
              <strong>Admission application.</strong> The pupil's details, the guardian's details, previous schooling
              and the documents you upload. Fields are required only where the school needs them to process the case.
            </li>
            <li>
              <strong>Application tracking.</strong> The reference number and the pupil's date of birth. Both are
              needed before the site shows any status, and neither is placed in a web address.
            </li>
          </ul>
        </div>

        <h2 className="mt-10 text-[1.3rem]">Cookies</h2>
        <p className="lede mt-2 max-w-3xl">
          The public site sets one small cookie, <code>mcv_form_token</code>, so that a form you submit can be checked
          for authenticity. It holds a signature, not anything about you. Signing in adds two more.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Cookie</th>
                <th>Set when</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>mcv_form_token</code></td>
                <td>The first page you open</td>
                <td>Rejects forged or automated submissions. It expires after two hours and is re-issued when a form is next used.</td>
              </tr>
              <tr>
                <td><code>mcv_session</code></td>
                <td>Signing in</td>
                <td>
                  Holds an opaque token — only its SHA-256 hash is stored in the database, so a stolen table cannot be
                  replayed as a login. Cleared on sign-out and when the session lapses.
                </td>
              </tr>
              <tr>
                <td><code>mcv_csrf</code></td>
                <td>Signing in</td>
                <td>
                  Paired with the token inside each portal form. It is scoped to your session and is useless on its
                  own.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[0.9rem]" style={{ color: "var(--ink-muted)" }}>
          Your light or dark theme is kept in your own browser's local storage under <code>mcv-theme</code>; it is
          never sent to the school. There is no third-party analytics, advertising or social tracking script on this
          site, and nothing here is passed to an ad network.
        </p>

        <h2 className="mt-10 text-[1.3rem]">Inside the school portal</h2>
        <div className="mt-4 overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Record</th>
                <th>How long it is kept</th>
                <th>Who may read it</th>
              </tr>
            </thead>
            <tbody>
              {policyRows.map((row) => (
                <tr key={row.record}>
                  <th scope="row">{row.record}</th>
                  <td>{row.held}</td>
                  <td>{row.who}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 max-w-3xl">
          <InfoGap
            label="Retention periods"
            what="Exact storage durations are the school's decision and are entered per record type in the administration console. Until they are recorded above, this table describes access rather than timescales."
          />
        </div>

        <h2 className="mt-10 text-[1.3rem]">Photographs of children</h2>
        <div className="mt-4 max-w-3xl space-y-3">
          <p>
            An album is published only when the school has marked every identifiable pupil in it as consent-cleared.
            Until that mark exists, the photograph is visible inside the portal and nowhere else. Withdrawing consent
            or taking an album down removes the image from the public gallery as soon as the page is next regenerated.
          </p>
          <p>
            A family can withdraw consent at any time. The school treats a withdrawal as applying to images already
            published, not only to future ones.
          </p>
        </div>

        <h2 className="mt-10 text-[1.3rem]">How the site protects a record</h2>
        <div className="mt-4 max-w-3xl">
          <ul className="space-y-2 pl-5">
            <li>Permissions are enforced on the server for every request, not only hidden in the page you are shown.</li>
            <li>Passwords are stored as a salted scrypt hash. Nobody, including staff, can read a stored password back.</li>
            <li>Uploaded documents are addressed by a random identifier and checked against their content type; a file belonging to one family cannot be fetched by guessing an address.</li>
            <li>Sign-in failures, lockouts and each sensitive action are written to an audit trail with a hashed IP address.</li>
            <li>
              Online fee payment is not switched on yet. When the school enables it, no card number, expiry date or CVV
              will be held on this server — a payment is confirmed against the provider's own record instead.
            </li>
            {!env.mailConfigured && (
              <li>
                Email notifications are switched off until the school connects a mail account, so the site never tells a
                family a message was sent when it was not.
              </li>
            )}
          </ul>
        </div>

        <h2 className="mt-10 text-[1.3rem]">Asking for a correction</h2>
        <div className="mt-4 max-w-3xl space-y-3">
          <p>
            A guardian may ask the school to correct or remove personal information about their child, and may ask how
            the school came to hold it. The office amends records when the request is made and verified; a record still
            needed for a statutory reason is kept and the family is told why.
          </p>
          {address || email || phone || dpo ? (
            <address className="not-italic">
              {dpo && <p className="mb-1">Data protection contact: {dpo}</p>}
              {address && (
                <p className="mb-1">
                  {address.split("\n").map((line, index) => (
                    <span key={index} className="block">
                      {line}
                    </span>
                  ))}
                </p>
              )}
              {email && (
                <p className="mb-1">
                  <a href={`mailto:${email}`} className="no-underline hover:underline">
                    {email}
                  </a>
                </p>
              )}
              {phone && (
                <p>
                  <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="no-underline hover:underline">
                    {phone}
                  </a>
                </p>
              )}
            </address>
          ) : (
            <InfoGap
              label="Contact for privacy requests"
              what="The school's postal address, office email and a named data-protection contact have not been recorded yet. Add them in the settings console and they appear here."
            />
          )}
        </div>

        {!page?.body && (
          <div className="mt-10 max-w-3xl">
            <InfoGap
              label="School-authored notice"
              what="This page currently describes the platform. Publish a content page with the slug privacy to have the school's own wording shown above it."
            />
          </div>
        )}
      </section>
    </>
  );
}
