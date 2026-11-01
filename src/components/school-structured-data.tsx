import { getSchoolName, getSettings, listVisibleSocialLinks, settingText } from "@/server/content/site";
import { env } from "@/server/config/env";

/**
 * `School` structured data, built only from facts the school has confirmed.
 *
 * Google will show an address, a telephone or a founding date in search results
 * as though the school itself had stated it. So each field is added when the
 * setting carries a confirmed value and omitted entirely when it does not — the
 * payload never contains a placeholder, a guess, or a number invented to make
 * the record look complete.
 */
export async function SchoolStructuredData() {
  const [schoolName, settings, socialLinks] = await Promise.all([
    getSchoolName(),
    getSettings(),
    listVisibleSocialLinks(),
  ]);

  const address = settingText(settings, "school.address");
  const phone = settingText(settings, "school.phone");
  const email = settingText(settings, "school.email");
  const established = settingText(settings, "school.established_year");
  const tagline = settingText(settings, "school.tagline");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "School",
    name: schoolName,
    url: env.APP_URL,
    ...(tagline ? { description: tagline } : {}),
    ...(address
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: address,
          },
        }
      : {}),
    ...(phone ? { telephone: phone } : {}),
    ...(email ? { email } : {}),
    ...(established && /^\d{4}$/.test(established) ? { foundingDate: established } : {}),
    ...(socialLinks.length > 0
      ? { sameAs: socialLinks.map((link) => link.url).filter((url): url is string => Boolean(url)) }
      : {}),
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />;
}
