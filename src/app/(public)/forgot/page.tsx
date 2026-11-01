import Link from "next/link";
import { Field, SubmitRow } from "@/components/field";
import { FormNotice, FormTokens } from "@/components/form-tokens";
import { JsonForm } from "@/components/json-form";
import { PageHeader } from "@/components/page-header";
import { pageMetadata } from "@/lib/metadata";
import { TEACHER_SIGN_IN_HREF } from "@/lib/navigation";
import { currentFormToken } from "@/server/http/respond";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Forgotten username or password",
  description: "Ask the school office to restore access to your portal account.",
  path: "/forgot",
  noIndex: true,
});

export default async function ForgotPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const status = typeof params.form_status === "string" ? params.form_status : "";
  const error = typeof params.form_error === "string" ? params.form_error : "";
  const token = await currentFormToken();

  return (
    <>
      <PageHeader eyebrow="Portal" title="Forgotten username or password" />

      <section className="shell grid gap-12 py-12 lg:grid-cols-[1.1fr_1fr]">
        <div className="max-w-md">
          {status === "sent" ? (
            <p
              role="status"
              className="mb-6 border p-4 text-[0.95rem]"
              style={{
                borderColor: "var(--accent)",
                background: "var(--accent-soft)",
                borderRadius: "var(--radius)",
                color: "var(--ink)",
              }}
            >
              <strong>The request has reached the school office.</strong> The answer is the same whether or not the
              details match an account: the office checks the queue and hands a new credential to the right person. It
              will not be emailed automatically.
            </p>
          ) : null}
          {error ? <FormNotice code={error} /> : null}

          <JsonForm action="/api/auth/recovery" successMessage="The request has reached the school office.">
            <Field
              uid="recovery"
              name="identifier"
              label="Email address or full name"
              required
              autoComplete="username"
              hint="Whichever the account was created under. A name is slower to match, so the office may ask you for more."
            />
            <FormTokens token={token} uid="recovery" />
            <SubmitRow label="Ask the office" note="One request is enough; sending more does not move it up the queue." />
          </JsonForm>

          <p className="mt-6 text-[0.9rem]" style={{ color: "var(--ink-muted)" }}>
            Remembered it?{" "}
            <Link href="/signin" style={{ color: "var(--accent)", fontWeight: 600 }}>
              Sign in
            </Link>
            . Teachers sign in at{" "}
            <Link href={TEACHER_SIGN_IN_HREF} style={{ color: "var(--accent)", fontWeight: 600 }}>
              the teacher area
            </Link>
            .
          </p>
        </div>

        <aside>
          <h2 className="text-[1.1rem]">Why this asks the office</h2>
          <p className="mt-2 text-[0.95rem]" style={{ color: "var(--ink-secondary)" }}>
            A password reset that arrives by email is only as private as the mailbox. The school hands credentials to a
            person it can see, in a way it already trusts, and records that it did. Nobody can read your password: the
            system keeps only a derived hash, so a new one is issued rather than the old one recovered.
          </p>
          <p className="mt-4 text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
            A request does not change anything by itself. Until an administrator responds, the account keeps working
            exactly as it did.
          </p>
        </aside>
      </section>
    </>
  );
}
