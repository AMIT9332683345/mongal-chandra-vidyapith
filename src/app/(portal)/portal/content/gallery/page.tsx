import Link from "next/link";
import { EmptyState } from "@/components/section-heading";
import { PanelShell } from "@/components/panel-shell";
import { ActionForm } from "@/components/cms-form";
import { listAlbumsForAdmin } from "@/server/content/admin";
import { publishAlbumAction } from "@/server/content/actions";
import { makeCsrfToken, principalHas } from "@/server/auth/session";
import { requirePanel } from "@/server/auth/gate";
import { pageMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Gallery",
  description: "Albums, their photographs and the consent recorded for each one.",
  path: "/portal/content/gallery",
  noIndex: true,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  unpublished: "Taken down",
  archived: "Archived",
};

export default async function GalleryPanelPage() {
  const actor = await requirePanel("gallery.view", "/portal/content/gallery");
  const albums = await listAlbumsForAdmin();
  const csrfToken = makeCsrfToken(actor.sessionId);
  const canPublish = principalHas(actor, "gallery.publish");
  const canVerify = principalHas(actor, "gallery.consent.verify");

  return (
    <PanelShell
      actor={actor}
      active="/portal/content/gallery"
      eyebrow="Content panel"
      title="Gallery"
      intro="A photograph of a pupil becomes public only when a named person with the consent-verification permission has recorded a granted answer for every identifiable child in the album. Nothing here publishes by default."
    >
      <p className="mb-6">
        <Link href="/portal/content/gallery/new" className="button button-gold">
          New album
        </Link>
      </p>

      {albums.length === 0 ? (
        <EmptyState
          title="No albums yet"
          note="An album is a container for photographs and for the consent answers that permit them to be seen. Creating one uploads nothing and publishes nothing."
        />
      ) : (
        <div className="overflow-x-auto">
          <table>
            <caption className="sr-only">Every album, how many frames it holds and what is still owed</caption>
            <thead>
              <tr>
                <th scope="col">Album</th>
                <th scope="col">State</th>
                <th scope="col">Photographs</th>
                <th scope="col">Consent outstanding</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {albums.map((album) => (
                <tr key={album.id}>
                  <th scope="row" className="text-left font-semibold">
                    <Link href={`/portal/content/gallery/${album.id}`}>{album.title}</Link>
                    <span className="block text-[0.82rem] font-normal" style={{ color: "var(--ink-muted)" }}>
                      /gallery/{album.slug}
                      {album.categoryName ? ` · ${album.categoryName}` : ""}
                    </span>
                  </th>
                  <td>
                    <span
                      className="tag"
                      style={
                        album.status === "published"
                          ? { borderColor: "var(--accent)", color: "var(--accent)" }
                          : undefined
                      }
                    >
                      {STATUS_LABEL[album.status] ?? album.status}
                    </span>
                  </td>
                  <td>{album.photoCount}</td>
                  <td>
                    {album.pendingConsent > 0 ? (
                      <strong style={{ color: "var(--alert)" }}>{album.pendingConsent}</strong>
                    ) : (
                      "none"
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap items-center gap-2">
                      {album.status === "published" && canPublish ? (
                        <ActionForm
                          action={publishAlbumAction}
                          csrfToken={csrfToken}
                          submitLabel="Take down"
                          variant="secondary"
                          small
                          inline
                          hidden={{ id: album.id, intent: "unpublish" }}
                        />
                      ) : null}
                      {album.photoCount === 0 ? (
                        <span className="text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
                          Add photographs before publishing
                        </span>
                      ) : (
                        <Link href={`/portal/content/gallery/${album.id}`} className="button button-secondary button-small">
                          Open
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!canVerify && (
        <p className="pending mt-8">
          <strong>Publishing is not on your panel.</strong> You may file photographs and write their captions; the album
          goes public only when someone holding “gallery.consent.verify” and “gallery.publish” confirms that a guardian
          agreed to each identifiable pupil in it. That is two permissions on purpose, and they are deliberately not
          given to the same people who upload.
        </p>
      )}
    </PanelShell>
  );
}
