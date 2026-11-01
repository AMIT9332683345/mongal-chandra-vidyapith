import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/sign-in-form";
import { PageHeader } from "@/components/page-header";
import { pageMetadata } from "@/lib/metadata";
import { getCurrentPrincipal } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Teacher sign in",
  description: "The staff area for teachers: classes, notices and the school calendar.",
  path: "/teacher/signin",
  noIndex: true,
});

function safeNext(value: string | string[] | undefined): string {
  if (typeof value !== "string") return "/teacher";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/teacher";
  return value.slice(0, 120);
}

export default async function TeacherSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const principal = await getCurrentPrincipal();
  if (principal) redirect("/teacher");
  const next = safeNext((await searchParams).next);

  return (
    <>
      <PageHeader eyebrow="Staff area" title="Teacher sign in" />

      <section className="shell grid gap-12 py-12 lg:grid-cols-[1fr_1.1fr]">
        <div className="max-w-md">
          <SignInForm next={next} />

          <p className="mt-6 text-[0.9rem]" style={{ color: "var(--ink-muted)" }}>
            Teacher accounts are created by the school office. The first sign-in uses the password the office issued;
            you will be asked to choose your own before the account is used for anything else.
          </p>
          <p className="mt-3 text-[0.9rem]" style={{ color: "var(--ink-muted)" }}>
            Forgotten the address or the password?{" "}
            <Link href="/forgot" style={{ color: "var(--accent)", fontWeight: 600 }}>
              Ask the office here
            </Link>{" "}
            — the request goes to the same queue an administrator answers.{" "}
            <Link href="/signin" style={{ color: "var(--accent)" }}>
              Not a teacher?
            </Link>
          </p>
        </div>

        <aside>
          <h2 className="text-[1.1rem]">What a teacher sees</h2>
          <p className="mt-2 text-[0.95rem]" style={{ color: "var(--ink-secondary)" }}>
            The classes you are assigned to, the calendar, and the notices the school writes for staff only. A notice
            marked “teachers” never appears on the public board, and a teacher cannot read the accounts, the fee
            ledger or another class&rsquo;s records merely by asking the server for them.
          </p>
          <p className="mt-4 text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
            The sign-in screen is the same credential system as the administrator&rsquo;s; what differs is the role
            attached to the account and the door it opens onto.
          </p>
        </aside>
      </section>
    </>
  );
}
