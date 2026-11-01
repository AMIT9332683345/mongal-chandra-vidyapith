/**
 * The content panel's own navigation.
 *
 * Each entry names the permission that makes it worth showing. This is display
 * logic only — the actions the pages submit re-check the same permission on the
 * server, so hiding a link is a kindness to the person using the panel and never
 * the thing that keeps the record safe.
 */
export type PanelLink = {
  href: string;
  label: string;
  /** One of the permission keys in `server/auth/permissions.ts`. */
  permission: string;
  note: string;
  /** Which heading the link sits under. Order below is the order on screen. */
  group: "Publishing" | "More content" | "Admissions" | "School";
};

export const CONTENT_PANEL_LINKS: PanelLink[] = [
  {
    href: "/portal/content",
    label: "Overview",
    permission: "notice.view",
    note: "What is live, what is waiting",
    group: "Publishing",
  },
  {
    href: "/portal/content/notices",
    label: "Notices",
    permission: "notice.view",
    note: "Draft, publish, schedule, archive",
    group: "Publishing",
  },
  {
    href: "/portal/content/events",
    label: "Events",
    permission: "event.view",
    note: "The calendar and what shows on it",
    group: "Publishing",
  },
  {
    href: "/portal/content/gallery",
    label: "Gallery",
    permission: "gallery.view",
    note: "Albums, photographs, consent",
    group: "Publishing",
  },
  {
    href: "/portal/content/homepage",
    label: "Homepage",
    permission: "homepage.edit",
    note: "Slideshow, blocks and wording",
    group: "Publishing",
  },
  {
    href: "/portal/content/downloads",
    label: "Downloads",
    permission: "document.upload",
    note: "Forms, circulars and papers",
    group: "More content",
  },
  {
    href: "/portal/content/testimonials",
    label: "Testimonials",
    permission: "homepage.edit",
    note: "Quotes, with consent",
    group: "More content",
  },
  {
    href: "/portal/content/achievements",
    label: "Achievements",
    permission: "achievement.edit",
    note: "Awards and verified results",
    group: "More content",
  },
  {
    href: "/portal/content/faqs",
    label: "Questions",
    permission: "faq.edit",
    note: "The answers families read",
    group: "More content",
  },
  {
    href: "/portal/content/pages",
    label: "Pages",
    permission: "page.view",
    note: "Long-form text the school writes",
    group: "More content",
  },
  {
    href: "/portal/admin/applications",
    label: "Applications",
    permission: "admission.view",
    note: "Review and decide admissions",
    group: "Admissions",
  },
  {
    href: "/portal/admin/enquiries",
    label: "Enquiries",
    permission: "enquiry.view",
    note: "Messages from families",
    group: "Admissions",
  },
  {
    href: "/portal/content/settings",
    label: "School details",
    permission: "school_setting.edit",
    note: "Every fact the public pages print",
    group: "School",
  },
  {
    href: "/portal/admin/users",
    label: "Accounts & roles",
    permission: "user.view",
    note: "Who may sign in, and as what",
    group: "School",
  },
  {
    href: "/portal/content/audit",
    label: "Audit trail",
    permission: "audit_log.view",
    note: "Who changed what, and when",
    group: "School",
  },
];

/** The links this account may see, grouped under their headings and in order. */
export function groupedPanelLinks(links: PanelLink[]): { group: PanelLink["group"]; links: PanelLink[] }[] {
  const order: PanelLink["group"][] = ["Publishing", "More content", "Admissions", "School"];
  return order
    .map((group) => ({ group, links: links.filter((link) => link.group === group) }))
    .filter((entry) => entry.links.length > 0);
}

/** The links this account is allowed to see, in the order above. */
export function panelLinksFor(has: (permission: string) => boolean): PanelLink[] {
  return CONTENT_PANEL_LINKS.filter((link) => has(link.permission));
}
