import { SiteChrome } from "@/components/site-chrome";

/**
 * Signed-in pages share the public header and footer, so the theme, the
 * navigation and the skip link behave identically on both sides of the login.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>;
}
