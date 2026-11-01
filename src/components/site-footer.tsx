import Link from "next/link";
import {
  getSchoolName,
  getSettings,
  listVisibleSocialLinks,
  settingText,
} from "@/server/content/site";
import { PORTAL_HREF, PRIMARY_NAV, SIGN_IN_HREF } from "@/lib/navigation";

const INFORMATION_LINKS = [
  { href: "/notices", label: "Notice board" },
  { href: "/events", label: "Events calendar" },
  { href: "/gallery", label: "Photo gallery" },
  { href: "/downloads", label: "Downloads" },
  { href: "/results", label: "Results & achievements" },
  { href: "/staff", label: "Teachers & staff" },
];

const SERVICE_LINKS = [
  { href: "/admissions/apply", label: "Application form" },
  { href: "/admissions/status", label: "Application status" },
  { href: PORTAL_HREF, label: "School portal" },
  { href: "/contact#faqs", label: "Common questions" },
];

const SOCIAL_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  twitter: "X (Twitter)",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
};

/**
 * Contact lines appear only when the school has confirmed them. An address the
 * office has not supplied is shown as a gap in the footer rather than a
 * plausible-looking guess, because visitors act on what is printed here.
 */
export async function SiteFooter() {
  const [schoolName, settings, socialLinks] = await Promise.all([
    getSchoolName(),
    getSettings(),
    listVisibleSocialLinks(),
  ]);

  const tagline = settingText(settings, "school.tagline");
  const address = settingText(settings, "school.address");
  const phone = settingText(settings, "school.phone");
  const email = settingText(settings, "school.email");
  const officeHours = settingText(settings, "school.office_hours");
  const mapUrl = settingText(settings, "school.map_url");
  const year = new Date().getFullYear();
  const monogram = schoolName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  return (
    <footer className="band-footer site-footer">
      <div className="shell grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div>
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full font-[family-name:var(--font-heading)] text-[0.95rem] font-extrabold"
              style={{ background: "var(--gold)", color: "#14203c" }}
            >
              {monogram || "MC"}
            </span>
            <span>
              <span className="block font-[family-name:var(--font-heading)] text-[1.12rem] font-bold leading-tight text-white">
                {schoolName}
              </span>
              <span className="block text-[0.78rem] uppercase tracking-[0.14em]" style={{ color: "var(--gold)" }}>
                {tagline ?? "Official school website"}
              </span>
            </span>
          </div>

          <p className="mt-4 max-w-sm text-[0.9rem] leading-relaxed">
            A school website written and published by the school itself. Notices, photographs and
            documents appear here only after the office publishes them.
          </p>

          {socialLinks.length > 0 && (
            <ul className="mt-5 flex list-none gap-2">
              {socialLinks.map((link) => (
                <li key={link.platform}>
                  <a
                    href={link.url}
                    rel="me noopener"
                    target="_blank"
                    className="inline-flex rounded-full border px-3 py-1 text-[0.78rem] font-semibold no-underline"
                    style={{ borderColor: "rgb(255 255 255 / 0.28)" }}
                  >
                    {link.label ?? SOCIAL_LABEL[link.platform] ?? link.platform}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <nav aria-label="Explore the site">
          <h2 className="text-[0.82rem] font-bold uppercase tracking-[0.16em]">Explore</h2>
          <ul className="mt-4 flex list-none flex-col gap-2 text-[0.9rem]">
            {PRIMARY_NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Information corner">
          <h2 className="text-[0.82rem] font-bold uppercase tracking-[0.16em]">Information</h2>
          <ul className="mt-4 flex list-none flex-col gap-2 text-[0.9rem]">
            {INFORMATION_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
          <h2 className="mt-6 text-[0.82rem] font-bold uppercase tracking-[0.16em]">Services</h2>
          <ul className="mt-4 flex list-none flex-col gap-2 text-[0.9rem]">
            {SERVICE_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="text-[0.82rem] font-bold uppercase tracking-[0.16em]">Reach the office</h2>
          <div className="mt-4 flex flex-col gap-2 text-[0.9rem]">
            {address ? (
              <address className="not-italic">
                {address.split("\n").map((line) => (
                  <span key={line} className="block">{line}</span>
                ))}
              </address>
            ) : (
              <p className="rounded border border-dashed px-3 py-2 text-[0.85rem]" style={{ borderColor: "rgb(255 255 255 / 0.28)" }}>
                Postal address not published yet.
              </p>
            )}
            {phone && (
              <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="font-semibold">
                {phone}
              </a>
            )}
            {email && <a href={`mailto:${email}`}>{email}</a>}
            {officeHours && <p className="text-[0.85rem]">{officeHours}</p>}
            {!phone && !email && <p className="text-[0.85rem]">Office contact details not published yet.</p>}
          </div>
          {mapUrl && (
            <a
              href={mapUrl}
              className="button button-gold mt-5 px-4 py-2 text-[0.85rem]"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open the campus map
            </a>
          )}
        </div>
      </div>

      <div className="footer-bottom">
        <div className="shell flex flex-col gap-2 py-5 pb-20 text-[0.8rem] md:flex-row md:items-center md:justify-between md:pb-5">
          <p>
            © {year} {schoolName}. Photographs of pupils are published only with the written consent of
            their parents or guardians.
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/privacy">Privacy &amp; child protection</Link>
            <Link href="/accessibility">Accessibility</Link>
            <Link href={SIGN_IN_HREF}>Admin login</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
