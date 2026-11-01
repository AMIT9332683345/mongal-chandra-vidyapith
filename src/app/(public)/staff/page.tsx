import { PageHeader } from "@/components/page-header";
import { StoredPhoto } from "@/components/stored-photo";
import { EmptyState, InfoGap } from "@/components/section-heading";
import { getSchoolName, listStaffDirectory } from "@/server/content/site";
import { pageMetadata } from "@/lib/metadata";

export const revalidate = 600;

export const metadata = pageMetadata({
  title: "Teachers and staff",
  description:
    "The school's teaching and administrative staff, with designations and departments as authorised for publication.",
  path: "/staff",
});

/** Two initials, used instead of an invented portrait. */
function Monogram({ name }: { name: string }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      aria-hidden="true"
      className="flex h-11 w-11 shrink-0 items-center justify-center border text-[0.85rem] font-semibold"
      style={{
        borderColor: "var(--line-strong)",
        background: "var(--accent-soft)",
        color: "var(--accent)",
        borderRadius: "var(--radius)",
        fontFamily: "var(--font-heading)",
      }}
    >
      {letters || "—"}
    </span>
  );
}

export default async function StaffPage() {
  const [staff, schoolName] = await Promise.all([listStaffDirectory(), getSchoolName()]);

  // A post marked for the directory with no person in it yet is a gap, not a zero.
  const departments = [...new Set(staff.map((person) => person.department).filter((name): name is string => !!name))];

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Teachers and staff"
        intro={`Those who work at ${schoolName}, listed with the designation and department the school has authorised for publication.`}
      />

      <section className="shell py-12">
        {staff.length === 0 ? (
          <InfoGap
            label="Staff directory"
            what="No profile has been published yet. Names, designations and photographs are entered by an authorised administrator; the site never generates them."
          />
        ) : (
          <>
            <ul className="grid list-none gap-x-8 gap-y-6 p-0 md:grid-cols-2">
              {staff.map((person, index) => (
                <li key={`${person.name}-${index}`} className="flex gap-4">
                  {person.photoDocumentId ? (
                    <span className="w-11 shrink-0 overflow-hidden" style={{ borderRadius: "var(--radius)" }}>
                      <StoredPhoto documentId={person.photoDocumentId} alt={`Portrait of ${person.name}`} />
                    </span>
                  ) : (
                    <Monogram name={person.name} />
                  )}
                  <div>
                    <h2
                      className="text-[1.02rem] font-semibold"
                      style={{ color: "var(--ink)", fontFamily: "var(--font-heading)" }}
                    >
                      {person.name}
                    </h2>
                    <p className="mt-0.5 text-[0.92rem]" style={{ color: "var(--accent)" }}>
                      {person.designation ?? "Staff"}
                      {person.department ? ` · ${person.department}` : ""}
                    </p>
                    {person.qualifications && (
                      <p className="mt-1 text-[0.88rem]" style={{ color: "var(--ink-muted)" }}>
                        {person.qualifications}
                      </p>
                    )}
                    {person.biography && (
                      <p className="mt-2 text-[0.92rem]" style={{ color: "var(--ink-secondary)" }}>
                        {person.biography}
                      </p>
                    )}
                    {person.contact && (
                      <p className="mt-2 text-[0.88rem]">
                        <span style={{ color: "var(--ink-muted)" }}>Official contact: </span>
                        <span style={{ color: "var(--ink)" }}>{person.contact}</span>
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <div className="rule mt-12 pt-8">
              <h2 className="text-[1.1rem]">Departments</h2>
              {departments.length > 0 ? (
                <p className="mt-2 text-[0.95rem]" style={{ color: "var(--ink-secondary)" }}>
                  {departments.join(" · ")}
                </p>
              ) : (
                <EmptyState title="No departments published" note="Departments appear once an administrator records them." />
              )}
              <p className="mt-6 text-[0.88rem]" style={{ color: "var(--ink-muted)" }}>
                Personal telephone numbers and private details are not published here. A staff member&rsquo;s official
                contact appears only where the school has authorised it, and a portrait appears only where the school
                holds one cleared for the website.
              </p>
            </div>
          </>
        )}
      </section>
    </>
  );
}
