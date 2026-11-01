import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PanelShell } from "@/components/panel-shell";
import { formatDate, formatDateTime } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import { panelLinksFor } from "@/lib/panel-nav";
import { getCurrentPrincipal, principalHas } from "@/server/auth/session";
import { listNoticesForStaff } from "@/server/content/staff";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Teacher area",
  description: "The staff notices and panel links for a teacher account.",
  path: "/teacher",
  noIndex: true,
});

/**
 * The teacher's own landing page.
 *
 * It is deliberately not the administrator's portal with links removed. A
 * teacher arrives here to read what the school wrote for staff — a timetable
 * change, an examination instruction, the first password the office issued —
 * and to reach the parts of the panel their role opens. A notice marked for
 * teachers never appears on the public board, and this page is where that
 * audience is served.
 */
export default async function TeacherPage() {
  const principal = await getCurrentPrincipal();
  if (!principal) redirect("/teacher/signin?next=%2Fteacher");

  const isTeacher = principal.roleKeys.includes("teacher");
  // An administrator may look at the teacher area to check what staff can read;
  // the query below still asks for the teacher audience, not the admin one.
  const isAdminPreview = principal.roleKeys.includes("super_admin") || principal.roleKeys.includes("school_admin");

  if (!isTeacher && !isAdminPreview) {
    return (
      <>
        <PageHeader eyebrow="Staff area" title="This area is for teachers" />
        <section className="shell max-w-3xl py-12">
          <div className="card p-6">
            <p className="text-[1rem]">
              <strong>{principal.displayName}</strong>, this account holds{" "}
              {principal.roleKeys.length > 0 ? principal.roleKeys.join(", ") : "no role"}, which is not a teacher
              account. Nothing was hidden by mistake: the teacher area is where staff notices (including credentials
              the office issues) are read, and a pupil or guardian account must not see them.
            </p>
            <p className="mt-4 text-[0.95rem]" style={{ color: "var(--ink-muted)" }}>
              The rest of your portal is unchanged. If you believe the role is wrong, ask the school administrator to
              correct it.
            </p>
            <p className="mt-6 flex flex-wrap gap-3">
              <Link href="/portal" className="button button-primary">
                Go to the portal
              </Link>
              <Link href="/portal/account" className="button button-secondary">
                Account settings
              </Link>
            </p>
          </div>
        </section>
      </>
    );
  }

  const notices = await listNoticesForStaff(isTeacher ? principal.roleKeys : ["teacher"]);
  const links = panelLinksFor((permission) => principalHas(principal, permission)).filter(
    (link) => link.href !== "/portal/content",
  );

  return (
    <>
      <PanelShell
        actor={principal}
        active="/teacher"
        eyebrow="Staff area"
        title={isTeacher ? `Good to see you, ${principal.displayName}` : `Teacher area (preview), ${principal.displayName}`}
        intro="Notices the school wrote for staff are collected here. They are published and final, but they are not public: the website's notice board never shows them."
      >
        {principal.mustChangePassword ? (
          <p
            className="mb-6 border p-4 text-[0.94rem]"
            style={{ borderColor: "var(--alert)", borderRadius: "var(--radius)", color: "var(--ink)" }}
          >
            <strong>This account still uses the password it was issued with.</strong>{" "}
            <Link href="/portal/account" style={{ color: "var(--accent)", fontWeight: 600 }}>
              Choose a private password
            </Link>{" "}
            before you use it for anything that names a pupil.
          </p>
        ) : null}

        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-[1.15rem]">Staff notices</h2>
            <p className="text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
              {notices.length} notice{notices.length === 1 ? "" : "s"} for your role
            </p>
          </div>

          {notices.length === 0 ? (
            <div className="pending mt-4">
              <p>
                Nothing is waiting for staff at the moment. When the office publishes a notice to teachers — a
                staffing change, an examination instruction, a new credential — it appears here, and only here.
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-4" style={{ listStyle: "none" }}>
              {notices.map((notice) => (
                <li key={notice.id} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="text-[1.05rem] font-semibold" style={{ color: "var(--ink)" }}>
                      {notice.title}
                    </h3>
                    {notice.pinned ? <span className="tag">pinned</span> : null}
                  </div>
                  <p className="mt-1 text-[0.82rem]" style={{ color: "var(--ink-muted)" }}>
                    {notice.categoryName ?? "Staff notice"}
                    {notice.publishedAt ? ` · published ${formatDateTime(notice.publishedAt)}` : ""}
                    {notice.expiresOn ? ` · until ${formatDate(notice.expiresOn)}` : ""}
                  </p>
                  {notice.summary ? (
                    <p className="mt-2 text-[0.93rem]" style={{ color: "var(--ink-secondary)" }}>
                      {notice.summary}
                    </p>
                  ) : null}
                  <p className="mt-3 whitespace-pre-line text-[0.95rem]" style={{ color: "var(--ink)" }}>
                    {notice.body}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-5 text-[0.88rem]" style={{ color: "var(--ink-muted)" }}>
            A notice is visible here only while it is published, addressed to a role this account holds, and not past
            its stop date. The server decides all three from the notice row and the session, so a link copied to
            someone outside the audience opens nothing.
          </p>
        </section>

        <section className="rule mt-10 pt-8">
          <h2 className="text-[1.15rem]">The rest of your panel</h2>
          {links.length === 0 ? (
            <p className="mt-3 text-[0.93rem]" style={{ color: "var(--ink-muted)" }}>
              Your role does not open any publishing or admissions page. The notices above are the part of the panel
              written for you.
            </p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2" style={{ listStyle: "none" }}>
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="block h-full p-4 font-semibold no-underline"
                    style={{
                      color: "var(--accent)",
                      border: "1px solid var(--line)",
                      borderRadius: "var(--radius)",
                      background: "var(--surface)",
                    }}
                  >
                    {link.label}
                    <span className="mt-1 block text-[0.85rem] font-normal" style={{ color: "var(--ink-muted)" }}>
                      {link.note}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="mt-8 flex flex-wrap gap-3 text-[0.92rem]">
          <Link href="/portal/account" className="button button-secondary">
            Change my address or password
          </Link>
          <Link href="/notices" className="button button-secondary">
            Public notice board
          </Link>
        </p>
      </PanelShell>
    </>
  );
}
