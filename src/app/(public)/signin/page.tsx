import { redirect } from "next/navigation";
import { SignInForm } from "@/components/sign-in-form";
import { PageHeader } from "@/components/page-header";
import { pageMetadata } from "@/lib/metadata";
import { getCurrentPrincipal } from "@/server/auth/session";
import { getSchoolName } from "@/server/content/site";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Sign in",
  description: "Sign in to the school portal for staff, pupils and guardians.",
  path: "/signin",
  noIndex: true,
});

/**
 * Only a path on this site may follow a sign-in. A full URL in `?next=` is
 * dropped, so the parameter cannot be used to bounce a freshly authenticated
 * browser to another domain.
 */
function safeNext(value: string | string[] | undefined): string {
  if (typeof value !== "string") return "/portal";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/portal";
  return value.slice(0, 120);
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const next = safeNext((await searchParams).next);
  const principal = await getCurrentPrincipal();
  if (principal) redirect(next);

  const schoolName = await getSchoolName();

  return (
    <>
      <PageHeader eyebrow="Portal" title="Sign in" />

      <section className="shell grid gap-12 py-12 lg:grid-cols-[1fr_1.1fr]">
        <div className="max-w-md">
          <SignInForm next={next} />

          <p className="mt-6 text-[0.9rem]" style={{ color: "var(--ink-muted)" }}>
            Accounts are created by the school office. There is no public registration, and no shared administrator
            password: the first sign-in on a new installation is completed by the setup command described in the
            deployment notes.
          </p>
          <p className="mt-3 text-[0.9rem]" style={{ color: "var(--ink-muted)" }}>
            Forgotten a password? Ask the office to issue a single-use reset link. A reset is logged, and the old
            sessions end when it is used.
          </p>
        </div>

        <aside>
          <h2 className="text-[1.1rem]">What the portal holds</h2>
          <p className="mt-2 text-[0.95rem]" style={{ color: "var(--ink-secondary)" }}>
            {schoolName}&rsquo;s portal is one address with different rooms behind it. A teacher sees the classes they
            teach; a guardian sees only their own children; the office sees the records its role is written for. Each
            account is checked on the server for every action, not merely hidden in the browser.
          </p>
          <p className="mt-4 text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
            Attendance, marks, fee statements, timetable entries and library loans are reachable only after sign-in.
            Nothing on this page is indexed by a search engine.
          </p>
        </aside>
      </section>
    </>
  );
}
