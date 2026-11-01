import { EmptyState } from "@/components/section-heading";
import { Field } from "@/components/field";
import { PanelShell } from "@/components/panel-shell";
import { ActionForm } from "@/components/cms-form";
import { formatDateTime } from "@/lib/format";
import {
  listAlbumsForAdmin,
  listHomepageSectionsForAdmin,
} from "@/server/content/admin";
import { getSettings, settingText } from "@/server/content/site";
import {
  changeHomepageSectionVisibilityAction,
  saveHeroAlbumsAction,
  saveHomepageSectionAction,
} from "@/server/content/actions";
import { makeCsrfToken, principalHas } from "@/server/auth/session";
import { requirePanel } from "@/server/auth/gate";
import { pageMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Homepage",
  description: "The slideshow frames and the blocks a visitor reads first.",
  path: "/portal/content/homepage",
  noIndex: true,
});

/** The value `setHeroAlbums` stores when the school looked and chose no slideshow. */
const SLIDESHOW_OFF = "none";

function currentHeroSlugs(value: string | null): string[] {
  if (!value || value.trim().toLowerCase() === SLIDESHOW_OFF) return [];
  return value
    .split(/[,\n]/)
    .map((slug) => slug.trim())
    .filter((slug) => slug.length > 0);
}

export default async function HomepagePanelPage() {
  const actor = await requirePanel("homepage.edit", "/portal/content/homepage");
  const [sections, albums, settings] = await Promise.all([
    listHomepageSectionsForAdmin(),
    listAlbumsForAdmin(),
    getSettings(),
  ]);
  const csrfToken = makeCsrfToken(actor.sessionId);
  const canPublish = principalHas(actor, "homepage.publish");

  const storedHero = settingText(settings, "site.hero_albums");
  const chosen = currentHeroSlugs(storedHero);
  // Only a published, consent-cleared album with something in it may be a frame.
  const eligible = albums.filter(
    (album) => album.status === "published" && album.consentCleared && album.photoCount > 0,
  );
  const configured = storedHero !== null;

  return (
    <PanelShell
      actor={actor}
      active="/portal/content/homepage"
      eyebrow="Content panel"
      title="Homepage"
      intro="Two things make the homepage: the photographs it cycles through and the blocks of words beneath them. Both are editable here, and neither changes what visitors see until it is published."
    >
      <section className="card p-6">
        <h2 className="text-[1.15rem]">The slideshow</h2>
        <p className="mt-1 text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
          The largest picture on the site is the easiest place to publish a pupil without permission, so a frame has to
          be an album that is already published, already consent-cleared, and holding at least one photograph.
        </p>

        <p className="mt-4 text-[0.92rem]">
          {configured ? (
            <>
              <strong>Stored choice:</strong>{" "}
              {chosen.length > 0 ? (
                <>
                  {chosen.map((slug, index) => (
                    <span key={slug}>
                      {index + 1}. /gallery/{slug}
                      {index < chosen.length - 1 ? " · " : ""}
                    </span>
                  ))}
                </>
              ) : (
                "no slideshow — the campus photograph stays in its own band"
              )}
            </>
          ) : (
            <span>
              <strong>Not chosen yet:</strong>{" "}
              {eligible.length > 0
                ? "until the school picks, the homepage cycles through the newest published albums."
                : "with no published album to show, the homepage uses the school’s own campus photograph."}
            </span>
          )}
        </p>

        {eligible.length === 0 ? (
          <p className="pending mt-4">
            Nothing here is tickable yet. Publish an album — which needs its consent recorded frame by frame — and it
            appears in this list.
          </p>
        ) : canPublish ? (
          <ActionForm
            action={saveHeroAlbumsAction}
            csrfToken={csrfToken}
            submitLabel="Set the slideshow"
            className="mt-5"
            note="Untick every box to turn the slideshow off. The order below is the order the homepage shows."
          >
            <div className="grid gap-x-6 sm:grid-cols-2">
              {eligible.map((album) => (
                <Field
                  key={album.id}
                  uid="hero-albums"
                  name={`hero.${album.slug}`}
                  label={album.title}
                  as="checkbox"
                  defaultChecked={chosen.includes(album.slug)}
                  hint={`/gallery/${album.slug} · ${album.photoCount} photograph${album.photoCount === 1 ? "" : "s"}`}
                />
              ))}
            </div>
          </ActionForm>
        ) : (
          <p className="pending mt-4">
            <strong>Choosing the slideshow is not on your panel.</strong> It needs “homepage.publish”. You may read the
            current choice above; changing it belongs to whoever publishes the homepage.
          </p>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-[1.35rem]">The blocks</h2>
        <p className="mt-1 text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
          Each block is one place on the homepage. A block with no words in it prints nothing, and a hidden block keeps
          its words while staying off the page.
        </p>

        {sections.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="No homepage blocks"
              note="The blocks are created with the database, so a school that has just been set up has empty ones to fill rather than invented sentences to delete."
            />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {sections.map((section) => (
              <article key={section.id} className="card p-6">
                <header className="flex flex-wrap items-center gap-3">
                  <h3 className="text-[1.05rem]">{section.heading || section.sectionKey}</h3>
                  <span
                    className="tag"
                    style={
                      section.visible
                        ? { borderColor: "var(--accent)", color: "var(--accent)" }
                        : undefined
                    }
                  >
                    {section.visible ? "Shown" : "Hidden"}
                  </span>
                  <span className="text-[0.82rem]" style={{ color: "var(--ink-muted)" }}>
                    {section.sectionKey}
                    {section.updatedAt ? ` · last changed ${formatDateTime(section.updatedAt) ?? "unknown"}` : ""}
                  </span>
                </header>

                {section.authoringNote && (
                  <p className="mt-2 text-[0.88rem]" style={{ color: "var(--ink-muted)" }}>
                    {section.authoringNote}
                  </p>
                )}

                <div className="mt-5 grid gap-x-6 sm:grid-cols-2">
                  <Field
                    uid={`section-${section.sectionKey}`}
                    name="heading"
                    label="Heading"
                    defaultValue={section.heading}
                    hint="Printed as the block’s title."
                  />
                  <Field
                    uid={`section-${section.sectionKey}`}
                    name="subheading"
                    label="Sub-heading"
                    defaultValue={section.subheading}
                  />
                  <div className="sm:col-span-2">
                    <Field
                      uid={`section-${section.sectionKey}`}
                      name="body"
                      label="Words"
                      as="textarea"
                      rows={5}
                      defaultValue={section.body}
                      hint="Only what the school would say about itself. A blank box prints nothing here."
                    />
                  </div>
                  <Field
                    uid={`section-${section.sectionKey}`}
                    name="ctaLabel"
                    label="Button text"
                    defaultValue={section.ctaLabel}
                    hint="Leave both button fields blank to show no button."
                  />
                  <Field
                    uid={`section-${section.sectionKey}`}
                    name="ctaHref"
                    label="Button link"
                    defaultValue={section.ctaHref}
                    hint="Starts with / for a page on this site, or https:// for somewhere else."
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-start gap-4">
                  <ActionForm
                    action={saveHomepageSectionAction}
                    csrfToken={csrfToken}
                    submitLabel="Save these words"
                    variant="primary"
                    small
                    inline
                    hidden={{ id: section.sectionKey }}
                  />
                  {canPublish ? (
                    section.visible ? (
                      <ActionForm
                        action={changeHomepageSectionVisibilityAction}
                        csrfToken={csrfToken}
                        submitLabel="Hide from the homepage"
                        variant="secondary"
                        small
                        inline
                        hidden={{ id: section.sectionKey }}
                        confirm={`Hide “${section.heading || section.sectionKey}” from the homepage? The words stay.`}
                      />
                    ) : (
                      <ActionForm
                        action={changeHomepageSectionVisibilityAction}
                        csrfToken={csrfToken}
                        submitLabel="Show on the homepage"
                        variant="gold"
                        small
                        inline
                        hidden={{ id: section.sectionKey, show: "on" }}
                        confirm={`Put “${section.heading || section.sectionKey}” in front of every visitor?`}
                      />
                    )
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {!canPublish && (
        <p className="pending mt-10">
          You are editing with “homepage.edit”. That is enough to write every block above and enough to be refused by
          the publish buttons, which are not shown to you at all. Whoever holds “homepage.publish” decides what the
          homepage actually carries.
        </p>
      )}
    </PanelShell>
  );
}
