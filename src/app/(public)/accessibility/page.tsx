import { PageHeader } from "@/components/page-header";
import { Prose } from "@/components/prose";
import { InfoGap, SectionHeading } from "@/components/section-heading";
import { formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import { getContentPage, getSettings, settingText } from "@/server/content/site";

export const revalidate = 600;

export async function generateMetadata() {
  const page = await getContentPage("accessibility");
  return pageMetadata({
    title: page?.title ?? "Accessibility statement",
    description:
      page?.seoDescription ??
      page?.intro ??
      "How this website is built for keyboard, screen-reader and low-vision use, what has been checked, and what still falls short.",
    path: "/accessibility",
  });
}

const CHECKS = [
  {
    area: "Keyboard",
    done:
      "Every control — the navigation menu, the theme switch, the gallery lightbox, each form and each link to a document — is reachable with Tab and operable with Enter or Space. No control traps the keyboard focus.",
  },
  {
    area: "Visible focus",
    done:
      "A single 2px focus outline is defined for the whole site and appears wherever the browser reports keyboard focus. It is deliberately not suppressed.",
  },
  {
    area: "Skip link",
    done:
      "The first thing on every page is a link that jumps past the navigation to the main content, visible as soon as it receives focus.",
  },
  {
    area: "Headings and landmarks",
    done:
      "One <h1> per page, sections in heading order, a banner/nav/main/contentinfo structure, and a named primary navigation, so screen-reader users can jump between regions instead of reading linearly.",
  },
  {
    area: "Form labels",
    done:
      "Every input has a real <label> bound by id, hints are tied to the field with aria-describedby, and required fields are announced — not signalled by an asterisk's colour alone.",
  },
  {
    area: "Errors",
    done:
      "A failed submission puts a summary at the top of the form with links to each field, announced through an aria-live region, and moves focus to it. Nothing is signalled only by turning a border red.",
  },
  {
    area: "Reading order",
    done:
      "The document order matches the visual order, including on mobile, so a linear reader follows the page as a sighted visitor does.",
  },
  {
    area: "Colour contrast",
    done:
      "Body text and interactive text meet at least 4.5:1 and large text 3:1 in both themes; the two palettes were chosen separately rather than by inverting one.",
  },
  {
    area: "Text size and reflow",
    done:
      "Type is set in relative units and headings scale with the viewport. Content stays usable when text is enlarged or when a phone is held sideways.",
  },
  {
    area: "Motion",
    done:
      "If the operating system asks for reduced motion, animations and smooth scrolling are turned off site-wide.",
  },
  {
    area: "Dark mode",
    done:
      "The theme switch is a real control with aria-pressed, the choice is remembered across pages and refreshes, and the system preference is respected only until the visitor picks one themselves. Text is never re-tinted by an image filter, so the photograph stays as it was taken.",
  },
  {
    area: "Works without JavaScript",
    done:
      "Every page, notice, event, gallery listing, document download and the admission form function with scripting off. Forms fall back to a normal post that returns to the page with the reason in the address.",
  },
];

const LIMITATIONS = [
  {
    issue: "Application status tracking",
    detail:
      "The reference-number check runs through JavaScript. Without it, the page explains why and points to the office telephone and email instead of failing silently.",
  },
  {
    issue: "Gallery lightbox",
    detail:
      "The enlarged view uses a native dialog with arrow-key navigation. The grid of thumbnails and their captions work without it, so the photographs themselves are never gated behind scripting.",
  },
  {
    issue: "Campus photograph",
    detail:
      "The image supplied is small, so it is shown at its true size on a white mount with an alternative description rather than stretched across the page. It will be replaced with a large, properly described original as soon as the school provides one.",
  },
  {
    issue: "Wide tables",
    detail:
      "Notice, results and fee tables scroll horizontally on narrow screens. Scrolling is not announced to every screen reader, so each table carries a caption saying which columns follow.",
  },
  {
    issue: "Portal dashboards",
    detail:
      "Attendance, marks, fee statements and the role dashboards are still being built. This statement covers the public site as it runs today and will be extended to the portal when those screens exist.",
  },
];

export default async function AccessibilityPage() {
  const [page, settings] = await Promise.all([getContentPage("accessibility"), getSettings()]);

  const email = settingText(settings, "school.email");
  const phone = settingText(settings, "school.phone");
  const name = settingText(settings, "school.name");

  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title={page?.title ?? "Accessibility statement"}
        intro={
          page?.intro ??
          "What has been done to make this site usable with a keyboard, a screen reader or magnification — and the parts that are not yet finished."
        }
      />

      {page?.body && (
        <section className="shell py-12">
          <Prose text={page.body} className="max-w-3xl" />
          {page.publishedAt && (
            <p className="mt-4 text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
              Published by the school on {formatDate(page.publishedAt)}.
            </p>
          )}
        </section>
      )}

      <section className="shell py-12" style={{ borderTop: page?.body ? "1px solid var(--line)" : undefined }}>
        <SectionHeading
          eyebrow="Standard"
          title="How the site is measured"
          description="This website is built to conform with WCAG 2.2 at Level AA. The checks listed below are the ones actually carried out on the current build."
        />
        <div className="mt-4 max-w-3xl">
          <p className="pending">
            <strong>No external audit yet.</strong> Conformance here is the result of the engineering standards applied
            during the build and the developer checks described below. A formal accessibility audit of{" "}
            {name ?? "the school's website"} by an independent tester has not been carried out, and this page should not
            be read as claiming one.
          </p>
        </div>

        <div className="mt-8 overflow-x-auto">
          <table>
            <caption className="sr-only">Accessibility features present in the current build</caption>
            <thead>
              <tr>
                <th scope="col">Area</th>
                <th scope="col">What the build does</th>
              </tr>
            </thead>
            <tbody>
              {CHECKS.map((row) => (
                <tr key={row.area}>
                  <th scope="row">{row.area}</th>
                  <td>{row.done}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-12 text-[1.3rem]">What does not meet the standard yet</h2>
        <p className="lede mt-2 max-w-3xl">
          An honest list. Each item is either a limitation of the technology or work that is still in progress, and each
          has a way to get the same result from the office.
        </p>
        <div className="mt-5 overflow-x-auto">
          <table>
            <caption className="sr-only">Known accessibility limitations and their alternatives</caption>
            <thead>
              <tr>
                <th scope="col">Part of the site</th>
                <th scope="col">Limitation and the alternative</th>
              </tr>
            </thead>
            <tbody>
              {LIMITATIONS.map((row) => (
                <tr key={row.issue}>
                  <th scope="row">{row.issue}</th>
                  <td>{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-12 text-[1.3rem]">Telling us about a barrier</h2>
        <div className="mt-4 max-w-3xl space-y-3">
          <p>
            If any part of this site cannot be used — a notice that will not open, a form that will not submit, text
            that is too faint to read — the school wants to hear about it, in whatever words suit you. A report is
            answered with what the problem is, whether it can be fixed and how long it will take. In the meantime the
            office will give you the same information in another format: large print, plain text, or read to you over
            the telephone.
          </p>
          {email || phone ? (
            <address className="not-italic">
              {email && (
                <p className="mb-1">
                  <a href={`mailto:${email}`} className="no-underline hover:underline">
                    {email}
                  </a>
                </p>
              )}
              {phone && (
                <p>
                  <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="no-underline hover:underline">
                    {phone}
                  </a>
                </p>
              )}
            </address>
          ) : (
            <InfoGap
              label="Feedback contact"
              what="The office email and telephone have not been confirmed yet. Record them in the settings console and they appear here."
            />
          )}
          <p className="text-[0.9rem]" style={{ color: "var(--ink-muted)" }}>
            You may also use the contact form on this website; choose the General enquiry and say which page and which
            device or reader you were using.
          </p>
        </div>

        {!page?.body && (
          <div className="mt-10 max-w-3xl">
            <InfoGap
              label="School-authored statement"
              what="This page currently describes the platform's build. Publish a content page with the slug accessibility to have the school's own wording shown above it."
            />
          </div>
        )}
      </section>
    </>
  );
}
