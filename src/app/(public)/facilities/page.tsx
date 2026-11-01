import { CampusPhoto } from "@/components/campus-photo";
import { PageHeader } from "@/components/page-header";
import { StoredPhoto } from "@/components/stored-photo";
import { InfoGap } from "@/components/section-heading";
import { getSchoolName, listPublicFacilities } from "@/server/content/site";
import { pageMetadata } from "@/lib/metadata";

export const revalidate = 600;

export const metadata = pageMetadata({
  title: "Campus and facilities",
  description:
    "The rooms, grounds and arrangements the school confirms it operates, with the details it chooses to publish.",
  path: "/facilities",
});

/** Headings for the groups the school can file a facility under. */
const GROUP_LABELS: Record<string, string> = {
  academic: "Teaching and learning",
  infrastructure: "Campus and buildings",
  sport: "Play and sport",
  sports: "Play and sport",
  welfare: "Health, water and sanitation",
  amenities: "Water, sanitation, safety and access",
  safety: "Safety and accessibility",
  transport: "Travel",
};

/**
 * Ordered by the table's own `sortOrder`, with an unknown group appearing under
 * its own name rather than vanishing from the page.
 */
function groupFacilities(rows: Awaited<ReturnType<typeof listPublicFacilities>>) {
  const order: string[] = [];
  const buckets = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!buckets.has(row.group)) {
      buckets.set(row.group, []);
      order.push(row.group);
    }
    buckets.get(row.group)!.push(row);
  }
  return order.map((group) => ({ group, label: GROUP_LABELS[group] ?? group, items: buckets.get(group)! }));
}

export default async function FacilitiesPage() {
  const [facilities, schoolName] = await Promise.all([listPublicFacilities(), getSchoolName()]);
  const groups = groupFacilities(facilities);

  return (
    <>
      <PageHeader
        eyebrow="Campus"
        title="Facilities"
        intro={`What ${schoolName} confirms it operates today. A room that is planned, closed, or not yet verified does not appear on this page.`}
      />

      <section className="shell py-12">
        {facilities.length === 0 ? (
          <InfoGap
            label="Facilities"
            what="No facility has been confirmed by the school yet. Each entry is marked confirmed by an authorised administrator before it can be listed, so the page cannot claim a laboratory or a playground that does not exist."
          />
        ) : (
          groups.map((group, index) => (
            <div key={group.group} className={index === 0 ? undefined : "rule mt-12 pt-12"}>
              <h2 className="text-[1.3rem]">{group.label}</h2>

              <dl className="mt-5 grid gap-x-10 gap-y-7 sm:grid-cols-2">
                {group.items.map((facility) => (
                  <div key={facility.slug}>
                    {facility.imageDocumentId && (
                      <StoredPhoto
                        documentId={facility.imageDocumentId}
                        alt={facility.summary ? `${facility.name} — ${facility.summary}` : facility.name}
                        className="mb-3"
                      />
                    )}
                    <dt
                      className="text-[1rem] font-semibold"
                      style={{ color: "var(--ink)", fontFamily: "var(--font-heading)" }}
                    >
                      {facility.name}
                    </dt>
                    {facility.detail && (
                      <dd className="mt-1 text-[0.9rem]" style={{ color: "var(--accent)" }}>
                        {facility.detail}
                      </dd>
                    )}
                    {(facility.description ?? facility.summary) && (
                      <dd className="mt-2 text-[0.95rem]" style={{ color: "var(--ink-secondary)" }}>
                        {facility.description ?? facility.summary}
                      </dd>
                    )}
                  </div>
                ))}
              </dl>
            </div>
          ))
        )}

        <div className="rule mt-14 grid items-center gap-8 pt-12 md:grid-cols-[1fr_260px]">
          <div>
            <h2 className="text-[1.2rem]">Photographs of the campus</h2>
            <p className="mt-2 text-[0.95rem]" style={{ color: "var(--ink-secondary)" }}>
              The picture beside this note is the school&rsquo;s own photograph. Larger views of the grounds,
              classrooms and laboratories are published in the gallery as the school adds them.
            </p>
            <p className="mt-4">
              <a href="/gallery" className="button button-secondary">
                Open the gallery
              </a>
            </p>
          </div>
          <CampusPhoto />
        </div>
      </section>
    </>
  );
}
