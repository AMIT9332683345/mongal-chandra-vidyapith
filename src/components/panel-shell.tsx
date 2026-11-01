import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { panelLinksFor, groupedPanelLinks, CONTENT_PANEL_LINKS, type PanelLink } from "@/lib/panel-nav";
import { principalHas, type Principal } from "@/server/auth/session";
import { SignOutButton } from "@/components/sign-out-button";

/**
 * The frame around every content-panel page.
 *
 * The links it shows are the ones this account may use, which is why an
 * administrator and a front-office clerk see different lists in the same
 * furniture. What is withheld is named rather than quietly missing: a person who
 * cannot see the gallery is told that the gallery needs a permission they do not
 * hold, so they know whom to ask instead of guessing that the school has no
 * photographs.
 */
export function PanelShell({
  actor,
  active,
  eyebrow,
  title,
  intro,
  children,
}: {
  actor: Principal;
  active: string;
  eyebrow: string;
  title: string;
  intro?: string | null;
  children: React.ReactNode;
}) {
  const links = panelLinksFor((permission) => principalHas(actor, permission));
  const groups = groupedPanelLinks(links);
  const withheld = CONTENT_PANEL_LINKS.filter((link) => !principalHas(actor, link.permission));

  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} intro={intro} />

      <div className="shell grid gap-10 py-12 lg:grid-cols-[260px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-5">
            <p className="eyebrow">Signed in as</p>
            <p className="mt-1 text-[0.95rem] font-semibold">{actor.displayName}</p>
            <p className="text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
              {actor.roleKeys.length > 0 ? actor.roleKeys.join(", ") : "No role assigned"}
            </p>

            <nav aria-label="Content panel">
              <div className="mt-5 hidden lg:block">
                <PanelNavList groups={groups} active={active} />
              </div>
              <details className="mt-5 lg:hidden">
                <summary className="cursor-pointer text-[0.82rem] font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
                  Panel menu
                </summary>
                <div className="mt-3">
                  <PanelNavList groups={groups} active={active} />
                </div>
              </details>
            </nav>

            <p className="mt-5 border-t pt-4" style={{ borderColor: "var(--line)" }}>
              <SignOutButton />
            </p>
          </div>

          {withheld.length > 0 && (
            <details className="pending mt-4 text-[0.85rem]">
              <summary className="cursor-pointer font-semibold">
                {withheld.length} part{withheld.length === 1 ? "" : "s"} of the panel your role does not open
              </summary>
              <p className="mt-2">
                {withheld.map((link) => `${link.label} (needs “${link.permission}”)`).join(", ")}. Ask the school
                administrator if one of those is part of your work.
              </p>
            </details>
          )}
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}

function PanelNavList({
  groups,
  active,
}: {
  groups: { group: PanelLink["group"]; links: PanelLink[] }[];
  active: string;
}) {
  return (
    <div className="space-y-5">
      {groups.map((entry) => (
        <div key={entry.group}>
          <h2 className="text-[0.72rem] font-semibold uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>
            {entry.group}
          </h2>
          <ul className="mt-1.5 space-y-0.5" style={{ listStyle: "none" }}>
            {entry.links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={link.href === active ? "page" : undefined}
                  className="block border-l-2 py-1.5 pl-3 text-[0.92rem] font-semibold no-underline"
                  style={{
                    borderColor: link.href === active ? "var(--gold)" : "transparent",
                    color: link.href === active ? "var(--accent)" : "var(--ink-secondary)",
                    background: link.href === active ? "var(--accent-soft)" : "transparent",
                  }}
                >
                  {link.label}
                  <span className="block text-[0.78rem] font-normal" style={{ color: "var(--ink-muted)" }}>
                    {link.note}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
