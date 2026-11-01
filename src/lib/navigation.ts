export type NavItem = {
  href: string;
  label: string;
  /** Sub-pages listed under the item in the dropdown and the mobile menu. */
  children?: { href: string; label: string }[];
};

/**
 * The site's own sections, grouped the way the reference school groups them:
 * a short top-level row with the detail one level underneath. Every target is
 * a route this platform provides, so the menu lives in code — the editable
 * links the school adds belong to `navigation_links` and appear in the footer.
 */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About Us" },
  {
    href: "/academics",
    label: "Academics",
    children: [
      { href: "/academics", label: "Curriculum & classes" },
      { href: "/results", label: "Results & achievements" },
      { href: "/facilities", label: "Facilities" },
      { href: "/staff", label: "Teachers & staff" },
    ],
  },
  {
    href: "/admissions",
    label: "Admissions",
    children: [
      { href: "/admissions", label: "How to apply" },
      { href: "/admissions/apply", label: "Application form" },
      { href: "/admissions/status", label: "Track an application" },
    ],
  },
  {
    href: "/notices",
    label: "Information Corner",
    children: [
      { href: "/notices", label: "Notice board" },
      { href: "/events", label: "Events calendar" },
      { href: "/gallery", label: "Photo gallery" },
      { href: "/downloads", label: "Downloads" },
    ],
  },
  { href: "/contact", label: "Contact Us" },
];

/**
 * Where the authenticated half lives.
 *
 * The public site and the portal can be deployed as two deployments of this one
 * project — the public pages on Vercel, the portal on an always-on Node host —
 * sharing one database. When they are, session cookies belong to the portal's
 * own origin, so every link into it has to be absolute: signing in on the public
 * origin would mint a cookie that the portal host never sees.
 *
 * Empty means "same origin", which is the correct answer for a single
 * deployment and for local development.
 */
const PORTAL_ORIGIN = (process.env.NEXT_PUBLIC_PORTAL_ORIGIN ?? "").replace(/\/$/, "");

export const SIGN_IN_HREF = `${PORTAL_ORIGIN}/signin`;
export const PORTAL_HREF = `${PORTAL_ORIGIN}/portal`;
