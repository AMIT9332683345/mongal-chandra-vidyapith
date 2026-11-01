import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/section-heading";
import { pageMetadata } from "@/lib/metadata";
import { formatFileSize } from "@/lib/format";
import { listPublicDocuments } from "@/server/content/site";

export const revalidate = 120;

export const metadata = pageMetadata({
  title: "Downloads",
  description:
    "Forms, circulars, syllabi and admission papers published by the school office for families to download.",
  path: "/downloads",
});

const GROUP_LABEL: Record<string, string> = {
  admission: "Admissions",
  circular: "Circulars",
  syllabus: "Syllabus",
  form: "Forms",
  policy: "Policies",
};

function groupLabel(category: string | null): string {
  if (!category) return "General";
  return GROUP_LABEL[category] ?? category.charAt(0).toUpperCase() + category.slice(1);
}

export default async function DownloadsPage() {
  const files = await listPublicDocuments();
  const groups = new Map<string, typeof files>();

  for (const file of files) {
    const key = groupLabel(file.category);
    groups.set(key, [...(groups.get(key) ?? []), file]);
  }

  return (
    <>
      <PageHeader
        eyebrow="Information corner"
        title="Downloads"
        intro="Forms, circulars and papers the office has published for families. Restricted documents are issued through the school portal and never listed here."
      />

      <section className="section">
        <div className="shell">
          {files.length === 0 ? (
            <EmptyState
              title="Nothing has been published for download yet"
              note="Files appear here the moment the office marks them public in the content panel."
            />
          ) : (
            <div className="grid gap-10 lg:grid-cols-[15rem_1fr]">
              <nav aria-label="Download categories" className="h-max lg:sticky lg:top-28">
                <p className="eyebrow">Categories</p>
                <ul className="mt-3 flex list-none flex-wrap gap-2 lg:flex-col">
                  {[...groups.keys()].map((key) => (
                    <li key={key}>
                      <a href={`#${key.toLowerCase().replace(/\s+/g, "-")}`} className="chip no-underline">
                        {key}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>

              <div className="flex flex-col gap-12">
                {[...groups.entries()].map(([key, rows]) => (
                  <section key={key} id={key.toLowerCase().replace(/\s+/g, "-")} aria-labelledby={`h-${key}`}>
                    <h2 id={`h-${key}`} className="text-[1.3rem]">
                      {key}
                    </h2>
                    <ul className="mt-4 grid list-none gap-3">
                      {rows.map((file) => (
                        <li key={file.id} className="card flex flex-wrap items-center justify-between gap-4 p-4">
                          <div className="min-w-0">
                            <p className="font-semibold" style={{ color: "var(--ink)" }}>
                              {file.title ?? "Untitled document"}
                            </p>
                            {file.description && (
                              <p className="mt-1 text-[0.88rem]" style={{ color: "var(--ink-secondary)" }}>
                                {file.description}
                              </p>
                            )}
                            <p className="mt-1 text-[0.78rem]" style={{ color: "var(--ink-muted)" }}>
                              {file.mimeType} · {formatFileSize(file.sizeBytes) ?? "size unknown"}
                            </p>
                          </div>
                          <a
                            href={`/api/downloads/${file.id}`}
                            className="button button-outline-navy button-small"
                            download
                          >
                            Download
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
