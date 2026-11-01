import Link from "next/link";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/change-password-form";
import { Field, SubmitRow } from "@/components/field";
import { JsonForm } from "@/components/json-form";
import { PageHeader } from "@/components/page-header";
import { SignOutButton } from "@/components/sign-out-button";
import { pageMetadata } from "@/lib/metadata";
import { getCurrentPrincipal, makeCsrfToken } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Account settings",
  description: "Change the address and password this account signs in with.",
  path: "/portal/account",
  noIndex: true,
});

function Notice({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="mb-8 border p-4 text-[0.95rem]"
      style={{
        borderColor: tone === "ok" ? "var(--accent)" : "var(--alert)",
        background: tone === "ok" ? "var(--accent-soft)" : "var(--surface)",
        borderRadius: "var(--radius)",
        color: "var(--ink)",
      }}
    >
      {children}
    </p>
  );
}

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const principal = await getCurrentPrincipal();
  if (!principal) redirect("/signin?next=%2Fportal%2Faccount");

  const params = await searchParams;
  const csrfToken = makeCsrfToken(principal.sessionId);
  const isTeacher = principal.roleKeys.includes("teacher");

  return (
    <>
      <PageHeader eyebrow="Your account" title="Account settings" />

      <section className="shell max-w-3xl py-12">
        {params.emailChanged === "1" ? (
          <Notice tone="ok">
            <strong>The sign-in address was changed.</strong> Every other device was signed out; this browser now uses
            the new address.
          </Notice>
        ) : null}
        {params.passwordChanged === "1" ? (
          <Notice tone="ok">
            <strong>The password was changed.</strong> Every other device was signed out. The school stores only a
            derived hash and cannot read the new password back to you.
          </Notice>
        ) : null}
        {principal.mustChangePassword ? (
          <Notice tone="warn">
            <strong>This account still uses the password it was issued with.</strong> Choose a private one below.
          </Notice>
        ) : null}

        <div className="card p-6">
          <h2 className="text-[1.15rem]">The address you sign in with</h2>
          <p className="mt-1 text-[0.95rem]" style={{ color: "var(--ink-muted)" }}>
            Currently <strong style={{ color: "var(--ink)" }}>{principal.email}</strong>. Changing it ends every
            session, including other devices, and the new address is what the sign-in screen expects from then on.
          </p>

          <div className="mt-5">
            <JsonForm
              action="/api/auth/account"
              successMessage="The sign-in address was changed."
              redirectTo="/portal/account?emailChanged=1"
              className="max-w-md"
            >
              <input type="hidden" name="csrfToken" value={csrfToken} readOnly />
              <Field
                uid="account-email"
                name="newEmail"
                label="New email address"
                type="email"
                autoComplete="email"
                required
                hint="Use an address only you can open."
              />
              <Field
                uid="account-email"
                name="currentPassword"
                label="Current password"
                type="password"
                autoComplete="current-password"
                required
                hint="Required because the address is half of the credential."
              />
              <SubmitRow label="Change the address" note="Other devices are signed out." />
            </JsonForm>
          </div>
        </div>

        <div className="rule mt-10 pt-8">
          <h2 className="text-[1.15rem]">Your password</h2>
          <p className="mt-1 max-w-prose text-[0.95rem]" style={{ color: "var(--ink-muted)" }}>
            Only a derived hash is stored, and no one can read the password back to you. Changing it signs out every
            other device.
          </p>
          <div className="mt-5">
            <ChangePasswordForm sessionId={principal.sessionId} redirectTo="/portal/account?passwordChanged=1" />
          </div>
        </div>

        <div className="rule mt-10 flex flex-wrap items-center gap-4 pt-8">
          <Link href="/portal" className="button button-secondary">
            Back to the portal
          </Link>
          {isTeacher ? (
            <Link href="/teacher" className="button button-secondary">
              Teacher area
            </Link>
          ) : null}
          <SignOutButton />
        </div>

        <p className="mt-8 text-[0.9rem]" style={{ color: "var(--ink-muted)" }}>
          Forgotten the address or the password? Sign out and use{" "}
          <Link href="/forgot" style={{ color: "var(--accent)" }}>
            the recovery form
          </Link>{" "}
          — the school office sees the request and issues a new credential in person or over a channel it already
          trusts.
        </p>
      </section>
    </>
  );
}
