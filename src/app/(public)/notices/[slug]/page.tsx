import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Prose } from "@/components/prose";
import { formatFileSize, formatDate } from "@/lib/format";
import { getPublicNoticeBySlug, listNoticeAttachments } from "@/server/content/site";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const notice = await getPublicNoticeBySlug(slug);
  if (!notice) return { title: "Notice not found", robots: { index: false, follow: false } };
  return {
    title: notice.title,
    description: notice.summary ?? undefined,
    alternates: { canonical: `/notices/${slug}` },
  };
}

export default async function NoticePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const notice = await getPublicNoticeBySlug(slug);
  if (!notice) notFound();

  const attachments = await listNoticeAttachments(notice.id);

  return (
    <>
      <PageHeader
        eyebrow={notice.categoryName ?? "Notice"}
        title={notice.title}
        intro={notice.summary}
      />

      <section className="shell-narrow py-12">
        <p className="mb-2 text-[0.9rem]" style={{ color: "var(--ink-muted)" }}>
          {formatDate(notice.issuedOn) ?? "Issue date not stated"}
          {notice.referenceNumber ? ` · Reference ${notice.referenceNumber}` : ""}
          {notice.expiresOn ? ` · Displayed until ${formatDate(notice.expiresOn)}` : ""}
        </p>

        {notice.isEmergency && (
          <p
            className="mt-4 border-l-2 px-4 py-3 text-[0.94rem] font-semibold"
            style={{ borderColor: "var(--urgent)", background: "var(--surface-raised)", color: "var(--ink)" }}
            role="note"
          >
            This is marked an emergency notice by the school office.
          </p>
        )}

        <Prose text={notice.body} className="mt-6 text-[1rem] leading-[1.8]" />

        {attachments.length > 0 && (
          <div className="mt-10 border-t pt-6" style={{ borderColor: "var(--line)" }}>
            <h2 className="text-[1.1rem]">Attachments</h2>
            <ul className="mt-3 flex list-none flex-col gap-2">
              {attachments.map((file) => (
                <li key={file.id}>
                  <Link
                    href={`/api/downloads/${file.id}`}
                    className="font-semibold no-underline hover:underline"
                    style={{ color: "var(--accent)" }}
                  >
                    {file.label ?? file.title ?? "Download attachment"}
                  </Link>
                  <span className="ml-2 text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
                    {file.mimeType}
                    {formatFileSize(file.sizeBytes) ? ` · ${formatFileSize(file.sizeBytes)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-10 text-[0.9rem]">
          <Link href="/notices" className="font-semibold no-underline hover:underline" style={{ color: "var(--accent)" }}>
            ← Back to the notice board
          </Link>
        </p>
      </section>
    </>
  );
}
