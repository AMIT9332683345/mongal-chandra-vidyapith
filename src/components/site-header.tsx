"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { PRIMARY_NAV, SIGN_IN_HREF, type NavItem } from "@/lib/navigation";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Chevron() {
  return (
    <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function DesktopItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  if (!item.children) {
    return (
      <Link href={item.href} aria-current={active ? "page" : undefined} data-active={active} className="nav-link">
        {item.label}
      </Link>
    );
  }
  return (
    <div className="group relative">
      <Link href={item.href} aria-current={active ? "page" : undefined} data-active={active} className="nav-link">
        {item.label}
        <Chevron />
      </Link>
      <div className="invisible absolute left-0 top-full z-40 w-64 opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        <div className="nav-panel">
          {item.children.map((child) => (
            <Link key={child.href} href={child.href} aria-current={pathname === child.href ? "page" : undefined}>
              {child.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export type SiteContact = {
  phone: string | null;
  email: string | null;
  officeHours: string | null;
};

export function SiteHeader({
  schoolName,
  subtitle,
  logoUrl,
  contact,
}: {
  schoolName: string;
  subtitle?: string | null;
  logoUrl?: string | null;
  contact?: SiteContact;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const phoneHref = contact?.phone ? `tel:${contact.phone.replace(/[^+\d]/g, "")}` : null;

  return (
    <>
      <header className="site-header">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>

        {/* Utility strip: contact first, then the links a family looks for. */}
        <div className="topbar">
          <div className="shell flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-1.5">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              {phoneHref && contact?.phone ? (
                <a href={phoneHref} className="inline-flex items-center gap-1.5">
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2.1Z" />
                  </svg>
                  {contact.phone}
                </a>
              ) : null}
              {contact?.email ? (
                <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5">
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m2 7 10 6 10-6" />
                  </svg>
                  {contact.email}
                </a>
              ) : null}
              {!contact?.phone && !contact?.email ? <span>Office contact details not published yet.</span> : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link href="/notices">Notice Board</Link>
              <Link href="/downloads">Downloads</Link>
              <Link href="/contact">Facing Issues?</Link>
              <Link href={SIGN_IN_HREF} className="font-bold" style={{ color: "var(--gold)" }}>
                Admin Login
              </Link>
            </div>
          </div>
        </div>

        <div className="mainbar sticky top-0 z-30">
          <div className="shell flex items-center justify-between gap-4 py-3">
            <Link href="/" className="flex min-w-0 items-center gap-3 no-underline" style={{ color: "var(--brand)" }}>
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" width={56} height={56} className="h-14 w-14 rounded-lg object-cover" />
              ) : (
                <span
                  aria-hidden="true"
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-lg text-[1.05rem] font-extrabold"
                  style={{ background: "var(--brand)", color: "var(--gold)" }}
                >
                  MC
                </span>
              )}
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[1.05rem] font-extrabold tracking-tight sm:text-[1.3rem]">
                  {schoolName}
                </span>
                {subtitle ? (
                  <span className="mt-0.5 block truncate text-[0.68rem] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--gold-ink)" }}>
                    {subtitle}
                  </span>
                ) : null}
              </span>
            </Link>

            <nav aria-label="Primary" className="hidden items-center xl:flex">
              {PRIMARY_NAV.map((item) => (
                <DesktopItem key={item.href} item={item} pathname={pathname} />
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <Link href="/admissions/apply" className="button button-gold hidden lg:inline-flex">
                Admissions Open
              </Link>
              <Link href="/contact" className="button button-outline-navy hidden xl:inline-flex">
                Enquire Now
              </Link>
              <ThemeToggle className="button button-secondary px-3" />
              <button
                type="button"
                className="button button-secondary px-3 xl:hidden"
                aria-expanded={menuOpen}
                aria-controls="mobile-nav"
                onClick={() => setMenuOpen((open) => !open)}
                aria-label={menuOpen ? "Close menu" : "Open menu"}
              >
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  {menuOpen ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-40 xl:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <nav
            id="mobile-nav"
            aria-label="Primary"
            className="absolute right-0 top-0 h-full w-[min(22rem,90vw)] overflow-y-auto bg-[var(--surface)] p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <span className="text-[1rem] font-extrabold" style={{ color: "var(--brand)" }}>
                Menu
              </span>
              <button
                type="button"
                className="button button-secondary px-3 py-2"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
              >
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <ul className="mt-4 list-none p-0">
              {PRIMARY_NAV.map((item) => (
                <li key={item.href} className="border-b" style={{ borderColor: "var(--line)" }}>
                  <Link
                    href={item.href}
                    className="block py-3 text-[0.98rem] font-bold no-underline"
                    style={{ color: "var(--brand)" }}
                  >
                    {item.label}
                  </Link>
                  {item.children && (
                    <ul className="flex list-none flex-col gap-1 pb-3 pl-3">
                      {item.children.map((child) => (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            className="block py-1 text-[0.9rem] no-underline"
                            style={{ color: "var(--ink-secondary)" }}
                          >
                            {child.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-5 grid gap-2">
              <Link href="/admissions/apply" className="button button-gold w-full">
                Admissions Open
              </Link>
              <Link href="/contact" className="button button-outline-navy w-full">
                Enquire Now
              </Link>
              <Link href={SIGN_IN_HREF} className="button button-primary w-full">
                Admin Login
              </Link>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
