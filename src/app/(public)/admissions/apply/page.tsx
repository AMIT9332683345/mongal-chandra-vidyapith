import Link from "next/link";
import { Field, FieldGroup, SubmitRow } from "@/components/field";
import { FormNotice, FormTokens } from "@/components/form-tokens";
import { JsonForm } from "@/components/json-form";
import { PageHeader } from "@/components/page-header";
import { InfoGap } from "@/components/section-heading";
import { pageMetadata } from "@/lib/metadata";
import { currentFormToken } from "@/server/http/respond";
import {
  getSchoolName,
  getSettings,
  listPublicClasses,
  settingText,
} from "@/server/content/site";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Admission application form",
  description:
    "The school's admission application: pupil details, guardian contact, previous schooling, supporting documents and a declaration.",
  path: "/admissions/apply",
});

const DOC_TYPES = [
  { value: "birth_certificate", label: "Birth certificate" },
  { value: "transfer_certificate", label: "Transfer certificate" },
  { value: "report_card", label: "Last report card" },
  { value: "address_proof", label: "Address proof" },
  { value: "photo", label: "Photograph of the applicant" },
  { value: "other", label: "Another document" },
];

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const noticeCode = typeof query.form_error === "string" ? query.form_error : null;

  const [token, schoolName, settings, classes] = await Promise.all([
    currentFormToken(),
    getSchoolName(),
    getSettings(),
    listPublicClasses(),
  ]);

  const openingClasses = classes.filter((item) => item.admissionOpen);
  const contactNote = settingText(settings, "admission.contact_note");
  const uid = "apply";

  return (
    <>
      <PageHeader
        eyebrow="Admissions"
        title={`Apply to ${schoolName}`}
        intro="Everything here is stored as one application for the office to read. It is not published, and it is not visible to any other family."
      />

      <section className="shell-narrow py-12">
        {openingClasses.length === 0 ? (
          <InfoGap
            label="Applications"
            what="The school has not marked any class as holding places, so the form is not offered. Contact the office and it will tell you what it is accepting."
          />
        ) : (
          <>
            {noticeCode && <FormNotice code={noticeCode} />}

            <p className="mb-8 text-[0.95rem]" style={{ color: "var(--ink-secondary)" }}>
              Keep the reference number given at the end. Checking progress needs that number{" "}
              <em>and</em> the applicant&rsquo;s date of birth, so a reference alone cannot be read by anyone else.
            </p>

            <JsonForm
              action="/api/applications"
              successMessage="Application received."
              redirectTo="/admissions/applied"
            >
              <FieldGroup title="The applicant" note="The child being proposed for admission.">
                <Field uid={uid} name="firstName" label="First name" required autoComplete="given-name" />
                <Field uid={uid} name="lastName" label="Surname" required autoComplete="family-name" />
                <Field uid={uid} name="dateOfBirth" label="Date of birth" type="date" required />
                <Field
                  uid={uid}
                  name="gender"
                  label="Gender"
                  as="select"
                  options={[
                    { value: "", label: "Prefer not to say" },
                    { value: "male", label: "Male" },
                    { value: "female", label: "Female" },
                    { value: "other", label: "Other" },
                  ]}
                />
                <Field uid={uid} name="nationality" label="Nationality" hint="Optional." />
                <Field uid={uid} name="motherTongue" label="Mother tongue" hint="Optional." />
                <Field
                  uid={uid}
                  name="applyingClassId"
                  label="Class applied for"
                  as="select"
                  required
                  options={openingClasses.map((item) => ({ value: item.id, label: item.name }))}
                />
                <Field uid={uid} name="siblingReference" label="Sibling already enrolled" hint="Optional — a name or admission number." />
              </FieldGroup>

              <FieldGroup title="Parent or guardian" note="Who the office should write to.">
                <Field uid={uid} name="guardianFirstName" label="Guardian first name" required autoComplete="name" />
                <Field uid={uid} name="guardianLastName" label="Guardian surname" required />
                <Field uid={uid} name="guardianRelation" label="Relationship" hint="Father, mother, or another relation." />
                <Field uid={uid} name="guardianEmail" label="Email" type="email" required autoComplete="email" />
                <Field uid={uid} name="guardianPhone" label="Telephone" type="tel" required autoComplete="tel" />
                <Field uid={uid} name="guardianOccupation" label="Occupation" hint="Optional." />
                <Field uid={uid} name="secondGuardianName" label="Second guardian" hint="Optional." />
                <Field uid={uid} name="secondGuardianPhone" label="Second guardian telephone" type="tel" hint="Optional." />
                <Field uid={uid} name="addressLine" label="Address" hint="Street and locality." />
                <Field uid={uid} name="city" label="Town or city" />
                <Field uid={uid} name="postalCode" label="Postal code" />
                <Field uid={uid} name="nearestLandmark" label="Nearest landmark" hint="Helps the office find the home." />
              </FieldGroup>

              <FieldGroup title="Previous schooling" note="Leave blank if the applicant has not attended another school.">
                <Field uid={uid} name="previousSchoolName" label="School name" />
                <Field uid={uid} name="previousSchoolBoard" label="Board or curriculum" />
                <Field uid={uid} name="previousClassCompleted" label="Last class completed" />
                <Field uid={uid} name="previousSchoolYear" label="Year attended" hint="For example 2024–25." />
                <Field
                  uid={uid}
                  name="transportRequired"
                  label="The school bus is wanted"
                  as="checkbox"
                  hint="Tick if you would like a place considered. A route is only offered if the school runs one."
                />
              </FieldGroup>

              <FieldGroup
                title="Supporting documents"
                note="Photographs or PDFs, up to 10 MB each. Files are stored privately: they are readable only by admission staff, never through a public link."
              >
                {[0, 1, 2, 3].map((slot) => (
                  <div key={slot} className="mb-4">
                    <label htmlFor={`${uid}-documentType-${slot}`} className="block">
                      Document {slot + 1} — what it is
                    </label>
                    <select id={`${uid}-documentType-${slot}`} name="documentTypes" className="mt-1.5">
                      {DOC_TYPES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <label htmlFor={`${uid}-document-${slot}`} className="mt-3 block">
                      File
                    </label>
                    <input
                      id={`${uid}-document-${slot}`}
                      name="documents"
                      type="file"
                      accept="image/*,application/pdf"
                      className="mt-1.5"
                      style={{ border: "1px solid var(--line)", padding: "0.5rem" }}
                    />
                  </div>
                ))}
              </FieldGroup>

              <FieldGroup title="Consent and declaration" note="Both are recorded with the application.">
                <Field
                  uid={uid}
                  name="photoConsent"
                  label="Photograph consent"
                  as="select"
                  options={[
                    { value: "pending", label: "Not decided yet" },
                    { value: "granted", label: "Granted — the school may photograph my child" },
                    { value: "withdrawn", label: "Withdrawn" },
                    { value: "not_required", label: "Not required" },
                  ]}
                  hint="Consent to publish a photograph of a child is separate from this application. An album cannot be published while it holds a pupil whose family has not granted it."
                />
                <Field
                  uid={uid}
                  name="declarationAccepted"
                  label="I confirm the details above are correct and I understand the school will verify them."
                  as="checkbox"
                  required
                />
              </FieldGroup>

              <FormTokens token={token} uid={uid} />
              <SubmitRow label="Submit the application" note="Marked * is required. Nothing is published; the office receives a file." />
            </JsonForm>

            <p className="mt-8 text-[0.92rem]" style={{ color: "var(--ink-secondary)" }}>
              {contactNote ?? (
                <>
                  If the form will not complete for you,{" "}
                  <Link href="/contact" className="underline">
                    write to the office
                  </Link>{" "}
                  and it will tell you what it accepts on paper.
                </>
              )}
            </p>
          </>
        )}
      </section>
    </>
  );
}
