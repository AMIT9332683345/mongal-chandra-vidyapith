import { getSchoolName, getSettings, settingText } from "@/server/content/site";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { FloatingActions } from "@/components/floating-actions";

/**
 * The public chrome, in one place so a page — including the 404 — cannot be
 * rendered without the navigation, the theme switch and the skip link.
 */
export async function SiteChrome({ children }: { children: React.ReactNode }) {
  const [schoolName, settings] = await Promise.all([getSchoolName(), getSettings()]);
  const tagline = settingText(settings, "school.tagline");
  const phone = settingText(settings, "school.phone");

  return (
    <>
      <SiteHeader
        schoolName={schoolName}
        subtitle={tagline}
        contact={{
          phone,
          email: settingText(settings, "school.email"),
          officeHours: settingText(settings, "school.office_hours"),
        }}
      />
      <main id="main">{children}</main>
      <SiteFooter />
      <FloatingActions phone={phone} />
    </>
  );
}
