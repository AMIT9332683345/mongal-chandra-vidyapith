import Link from "next/link";
import { ActionForm } from "@/components/cms-form";
import { AlbumFields } from "@/components/album-fields";
import { PanelShell } from "@/components/panel-shell";
import { listGalleryCategories } from "@/server/content/site";
import { saveAlbumAction } from "@/server/content/actions";
import { makeCsrfToken } from "@/server/auth/session";
import { requirePanel } from "@/server/auth/gate";
import { pageMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "New album",
  description: "Open an album for the school gallery.",
  path: "/portal/content/gallery/new",
  noIndex: true,
});

export default async function NewAlbumPage() {
  const actor = await requirePanel("gallery.edit", "/portal/content/gallery/new");
  const categories = await listGalleryCategories();

  return (
    <PanelShell
      actor={actor}
      active="/portal/content/gallery"
      eyebrow="Gallery"
      title="New album"
      intro="Creating an album writes no photograph and changes no page. The upload, the consent answers and the publishing all happen on the album's own page, in that order."
    >
      <ActionForm
        action={saveAlbumAction}
        csrfToken={makeCsrfToken(actor.sessionId)}
        submitLabel="Create the album"
        editLinkPrefix="/portal/content/gallery/"
        className="max-w-3xl"
      >
        <AlbumFields uid="new-album" categories={categories} />
      </ActionForm>

      <p className="mt-8 text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
        <Link href="/portal/content/gallery" style={{ color: "var(--accent)" }}>
          Back to the gallery
        </Link>
      </p>
    </PanelShell>
  );
}
