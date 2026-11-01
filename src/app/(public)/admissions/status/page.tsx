import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusLookup } from "@/components/status-lookup";
import { pageMetadata } from "@/lib/metadata";
import { currentFormToken } from "@/server/http/respond";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Check an application",
  description:
    "Track one admission application with its reference number and the applicant's date of birth. Nothing is listed or searchable.",
  path: "/admissions/status",
  noIndex: true,
});

export default async function StatusPage() {
  const token = await currentFormToken();

  return (
    <>
      <PageHeader
        eyebrow="Admissions"
        title="Check an application"
        intro="Two answers are needed and both must be right: the reference the school gave you, and the applicant's date of birth. There is no list to browse and no search by name."
      />

      <section className="shell-narrow py-12">
        <StatusLookup token={token} />

        <noscript>
          <p className="pending mt-6">
            <strong>This check needs JavaScript.</strong> The answer is kept out of the address bar on purpose, so a
            reference number and a date of birth are never stored in browser history. Ask the office by telephone or
            from the{" "}
            <a href="/contact" className="underline">
              contact form
            </a>
            .
          </p>
        </noscript>

        <p className="mt-10 text-[0.92rem]" style={{ color: "var(--ink-secondary)" }}>
          Lost the reference?{" "}
          <Link href="/contact" className="underline">
            Write to the admission desk
          </Link>{" "}
          with the applicant&rsquo;s name and date of birth and the office will find the file.
        </p>
      </section>
    </>
  );
}
