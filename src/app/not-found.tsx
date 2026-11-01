import Link from "next/link";
import { SiteChrome } from "@/components/site-chrome";
import { PRIMARY_NAV, SIGN_IN_HREF } from "@/lib/navigation";

export const dynamic = "force-dynamic";

/**
 * A page that has genuinely gone is different from one that was never here.
 * Both answers are given: the address is kept on screen so a person can compare
 * it with what they meant to type, and the school's own sections are listed so
 * they do not have to guess at a URL to get back into the site.
 */
export default function NotFound() {
  return (
    <SiteChrome>
      <div className="border-b py-14" style={{ borderColor: "var(--line)" }}>
        <div className="shell">
          <p className="eyebrow">Error 404</p>
          <h1 className="mt-2">This page cannot be found</h1>
          <p className="lede mt-3 max-w-2xl">
            Nothing lives at this address. Notices, circulars and admission documents are replaced when a new one is
            published, so a link saved from an earlier term may point at a page that has been retired.
          </p>
        </div>
      </div>

      <section className="shell py-12">
        <h2 className="text-[1.3rem]">Where to go from here</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {PRIMARY_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="tag">
              {item.label}
            </Link>
          ))}
        </div>

        <div className="mt-8 max-w-2xl">
          <p className="mb-2 text-[0.95rem]" style={{ color: "var(--ink-muted)" }}>
            If you followed a link from a notice, a printed leaflet or an email, tell the office and the page will be
            restored or corrected:
          </p>
          <ul className="space-y-1 text-[0.95rem]">
            <li>
              Use the <Link href="/contact" className="hover:underline">contact form</Link> and paste the address you
              clicked.
            </li>
            <li>
              Or sign in at the <Link href={SIGN_IN_HREF} className="hover:underline">school portal</Link> if you were
              looking for your own records.
            </li>
          </ul>
        </div>
      </section>
    </SiteChrome>
  );
}
