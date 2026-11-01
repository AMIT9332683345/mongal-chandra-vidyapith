import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { pageMetadata } from "@/lib/metadata";
import { getSchoolName } from "@/server/content/site";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Application received",
  description: "Confirmation that an admission application reached the school office.",
  path: "/admissions/applied",
  noIndex: true,
});

/** Only our own reference shape is echoed back; anything else in the address is ignored. */
const REFERENCE = /^MCV-\d{4}-[2-9A-HJ-NP-Za-hj-np-z]{6}$/;

export default async function AppliedPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = (await searchParams).ref;
  const reference = typeof raw === "string" && REFERENCE.test(raw) ? raw : null;
  const schoolName = await getSchoolName();

  return (
    <>
      <PageHeader eyebrow="Admissions" title="Application received" />

      <section className="shell-narrow py-12">
        <p className="lede">
          {schoolName} has the application. A printed copy of the reference below is worth keeping.
        </p>

        {reference ? (
          <div
            className="mt-6 border p-6"
            style={{ borderColor: "var(--accent)", background: "var(--accent-soft)", borderRadius: "var(--radius)" }}
          >
            <p className="eyebrow m-0">Reference number</p>
            <p
              className="mt-2 text-[1.6rem] font-semibold tracking-wide"
              style={{ color: "var(--ink)", fontFamily: "var(--font-heading)" }}
            >
              {reference}
            </p>
          </div>
        ) : (
          <p className="pending mt-6">
            <strong>Reference not shown.</strong> The submission completed, but this page cannot restate the number. It
            was given to you at the moment of submission; if it is lost, the office can find the file by name.
          </p>
        )}

        <h2 className="mt-10 text-[1.15rem]">What happens next</h2>
        <ol className="mt-3 pl-5" style={{ color: "var(--ink-secondary)" }}>
          <li className="mb-2">An admission officer opens the file and checks the documents attached to it.</li>
          <li className="mb-2">Where papers are missing, the school writes to the guardian email given on the form.</li>
          <li className="mb-2">A meeting or a written decision follows, according to the school&rsquo;s own process.</li>
        </ol>
        <p className="mt-4 text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
          The dates above are the sequence the platform records, not a promise of timing — the school sets how long each
          step takes.
        </p>

        <p className="mt-8 flex flex-wrap gap-3">
          <Link href="/admissions/status" className="button button-primary">
            Check the progress
          </Link>
          <Link href="/admissions" className="button button-secondary">
            Admission information
          </Link>
        </p>
      </section>
    </>
  );
}
