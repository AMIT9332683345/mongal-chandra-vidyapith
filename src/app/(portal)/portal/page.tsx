import Link from "next/link";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/change-password-form";
import { PageHeader } from "@/components/page-header";
import { SignOutButton } from "@/components/sign-out-button";
import { pageMetadata } from "@/lib/metadata";
import { CONTENT_PANEL_LINKS, panelLinksFor } from "@/lib/panel-nav";
import { getCurrentPrincipal, principalHas } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Portal",
  description: "The signed-in area of the school website.",
  path: "/portal",
  noIndex: true,
});

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const principal = await getCurrentPrincipal();
  if (!principal) redirect("/signin?next=%2Fportal");
  const params = await searchParams;
  const refused = typeof params.refused === "string" ? params.refused : "";
  const links = panelLinksFor((permission) => principalHas(principal, permission));

  return (
    <>
      <PageHeader eyebrow="Signed in" title={`Welcome, ${principal.displayName}`} />

      <section className="shell py-12">
        {principal.mustChangePassword && (
          <p
            className="mb-8 border p-4"
            style={{ borderColor: "var(--alert)", borderRadius: "var(--radius)", color: "var(--ink)" }}
          >
            <strong>This account still uses the password it was issued with.</strong> Choose a private one below
            before the school hands you any record. Nothing else in the portal is withheld from you — but a password
            that appears in a printed letter should not be the key to a pupil&apos;s file.
          </p>
        )}

        {refused && (
          <p
            className="mb-8 border p-4"
            style={{ borderColor: "var(--alert)", borderRadius: "var(--radius)", color: "var(--ink)" }}
          >
            <strong>That page asks for “{refused}”,</strong> which this account does not hold. It was not hidden to
            frustrate you: the school has decided who publishes what, and this is not yours to change. Ask the school
            administrator if you believe the role is wrong.{" "}
            {links.length > 0 ? (
              <>
                Your panel does hold{" "}
                {links.map((link, index) => (
                  <span key={link.href}>
                    {index > 0 ? ", " : ""}
                    <Link href={link.href} style={{ color: "var(--accent)", fontWeight: 600 }}>
                      {link.label.toLowerCase()}
                    </Link>
                  </span>
                ))}
                .
              </>
            ) : (
              "Nothing else is open to this account yet."
            )}
          </p>
        )}

        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 className="text-[1.15rem]">This account</h2>
            <table className="mt-3">
              <caption className="sr-only">The signed-in account as the server resolved it</caption>
              <tbody>
                <tr>
                  <th scope="row">Email</th>
                  <td>{principal.email}</td>
                </tr>
                <tr>
                  <th scope="row">Roles</th>
                  <td>{principal.roleKeys.length > 0 ? principal.roleKeys.join(", ") : "None assigned"}</td>
                </tr>
                <tr>
                  <th scope="row">Permission grants</th>
                  <td>{principal.grants.length}</td>
                </tr>
                <tr>
                  <th scope="row">Session</th>
                  <td>Valid until the idle window closes; the cookie is held by the browser and only its hash by the school.</td>
                </tr>
              </tbody>
            </table>

            <p className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/portal/account" className="button button-secondary">
                Account settings
              </Link>
              {principal.roleKeys.includes("teacher") ? (
                <Link href="/teacher" className="button button-secondary">
                  Teacher area
                </Link>
              ) : null}
              <SignOutButton />
            </p>
          </div>

          <div>
            <h2 className="text-[1.15rem]">What this account can do</h2>
            {links.length > 0 ? (
              <ul className="mt-3 space-y-3">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="font-semibold" style={{ color: "var(--accent)" }}>
                      {link.label}
                    </Link>
                    <span className="block text-[0.9rem]" style={{ color: "var(--ink-muted)" }}>
                      {link.note}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[0.95rem]">
                This account holds no content-panel permission, so there is nothing to open. The roles and the
                permissions behind them are stored and checked server-side; what a person sees here is a consequence of
                that, never the check itself.
              </p>
            )}

            <p className="mt-6 text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
              {CONTENT_PANEL_LINKS.length - links.length > 0
                ? `${CONTENT_PANEL_LINKS.length - links.length} part${CONTENT_PANEL_LINKS.length - links.length === 1 ? "" : "s"} of the content panel are closed to this account and are not listed above.`
                : "Every part of the content panel is open to this account."}{" "}
              Nothing on this page is indexed, and an unauthenticated request to it is sent to the sign-in screen.
            </p>
          </div>
        </div>
      </section>

      <section className="shell pb-16">
        <div className="rule pt-10">
          <h2 className="text-[1.15rem]">Your password</h2>
          <p className="mt-1 max-w-prose text-[0.95rem]" style={{ color: "var(--ink-muted)" }}>
            The school never sees your password: only a derived hash is stored, and no one can read it back to you. The
            address and the password can both be changed from{" "}
            <Link href="/portal/account" style={{ color: "var(--accent)", fontWeight: 600 }}>
              account settings
            </Link>
            . If you have forgotten them, the{" "}
            <Link href="/forgot" style={{ color: "var(--accent)" }}>
              recovery form
            </Link>{" "}
            puts a request in front of an administrator.
          </p>
          <ChangePasswordForm sessionId={principal.sessionId} />
        </div>
      </section>
    </>
  );
}
