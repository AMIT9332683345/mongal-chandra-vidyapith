import { notFound } from "next/navigation";
import Link from "next/link";
import { ActionForm } from "@/components/cms-form";
import { AlbumFields } from "@/components/album-fields";
import { Field } from "@/components/field";
import { PanelShell } from "@/components/panel-shell";
import { getAlbumForAdmin } from "@/server/content/admin";
import { listGalleryCategories } from "@/server/content/site";
import {
  publishAlbumAction,
  removeAlbumPhotoAction,
  saveAlbumAction,
  setAlbumCoverAction,
  setPhotoCaptionAction,
  setPhotoConsentAction,
  uploadAlbumPhotosAction,
} from "@/server/content/actions";
import { makeCsrfToken, principalHas } from "@/server/auth/session";
import { requirePanel } from "@/server/auth/gate";
import { pageMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Album",
  description: "An album's photographs, their consent answers and their publication.",
  path: "/portal/content/gallery",
  noIndex: true,
});

const CONSENT_OPTIONS = [
  { value: "pending", label: "Pending — a guardian's answer has not arrived" },
  { value: "granted", label: "Granted — written consent is on file" },
  { value: "withdrawn", label: "Withdrawn — the family asked for it back" },
  { value: "not_required", label: "Not needed — no identifiable pupil appears" },
];

const CONSENT_LABEL: Record<string, string> = {
  pending: "pending",
  granted: "granted",
  withdrawn: "withdrawn",
  not_required: "not needed",
};

export default async function AlbumEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePanel("gallery.view", "/portal/content/gallery");
  const { id } = await params;
  const album = await getAlbumForAdmin(id);
  if (!album) notFound();

  const categories = await listGalleryCategories();
  const csrfToken = makeCsrfToken(actor.sessionId);
  const canEdit = principalHas(actor, "gallery.edit");
  const canUpload = canEdit && principalHas(actor, "document.upload");
  const canVerify = principalHas(actor, "gallery.consent.verify");
  const canPublish = principalHas(actor, "gallery.publish") && canVerify;

  const owed = album.items.filter(
    (item) => item.containsIdentifiableMinors && item.consentStatus !== "granted",
  ).length;
  const withdrawn = album.items.filter((item) => item.consentStatus === "withdrawn").length;

  return (
    <PanelShell
      actor={actor}
      active="/portal/content/gallery"
      eyebrow="Gallery"
      title={album.title}
      intro={`State: ${album.status}. ${album.items.length} photograph${album.items.length === 1 ? "" : "s"} in this album.`}
    >
      <section className="card p-5">
        <h2 className="text-[1.05rem] font-semibold">Publication</h2>
        <p className="mt-1 text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
          {album.status === "published" && album.consentCleared
            ? "Live on the public gallery. Every identifiable pupil in it has a granted consent on record, and the person who certified that is named in the audit trail."
            : owed > 0
              ? `${owed} photograph${owed === 1 ? "" : "s"} show${owed === 1 ? "s" : ""} an identifiable pupil without a granted consent. This album cannot be published until each answer is recorded.`
              : withdrawn > 0
                ? "A consent was withdrawn. Remove that frame before publishing — a withdrawal is honoured by taking the picture out, not by leaving it in with a note."
                : album.items.length === 0
                  ? "Nothing to publish yet: an empty album has no frames to certify."
                  : "Every frame is accounted for. Publishing is allowed."}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {album.status !== "published" && (
            <ActionForm
              action={publishAlbumAction}
              csrfToken={csrfToken}
              submitLabel="Publish this album"
              variant={canPublish ? "gold" : "secondary"}
              small
              inline
              note={canPublish ? undefined : "Needs “gallery.publish” and “gallery.consent.verify”"}
              hidden={{ id: album.id, intent: "publish" }}
            />
          )}
          {album.status === "published" && principalHas(actor, "gallery.publish") && (
            <ActionForm
              action={publishAlbumAction}
              csrfToken={csrfToken}
              submitLabel="Take it down"
              variant="secondary"
              small
              inline
              note="Every frame is locked against the public file route again."
              hidden={{ id: album.id, intent: "unpublish" }}
            />
          )}
        </div>
        <p className="mt-3 text-[0.9rem]">
          <Link href={`/gallery/${album.slug}`} style={{ color: "var(--accent)" }}>
            /gallery/{album.slug}
          </Link>{" "}
          <span style={{ color: "var(--ink-muted)" }}>
            {album.status === "published" && album.consentCleared ? "— public now" : "— not public yet"}
          </span>
        </p>
      </section>

      <section className="rule mt-10 pt-8">
        <h2 className="text-[1.15rem]">Words about the album</h2>
        {canEdit ? (
          <ActionForm
            action={saveAlbumAction}
            csrfToken={csrfToken}
            submitLabel="Save these changes"
            hidden={{ id: album.id }}
            className="mt-4 max-w-3xl"
          >
            <AlbumFields uid="album-editor" album={album} categories={categories} />
          </ActionForm>
        ) : (
          <p className="mt-3 whitespace-pre-line text-[0.93rem]">{album.description || "No description written."}</p>
        )}
      </section>

      <section className="rule mt-10 pt-8">
        <h2 className="text-[1.15rem]">Add photographs</h2>
        {canUpload ? (
          <>
            <p className="mt-1 max-w-prose text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
              JPEG, PNG, WebP or PDF only, and what the bytes say the file is decides how it is served. Nothing uploaded
              here is reachable by the public until the album is published — an upload is held back, not exposed.
            </p>
            <ActionForm
              action={uploadAlbumPhotosAction}
              csrfToken={csrfToken}
              submitLabel="Upload to this album"
              variant="secondary"
              hidden={{ id: album.id }}
              resetOnSuccess
              className="mt-4 max-w-2xl"
            >
              <Field
                uid={`upload-${album.id}`}
                name="photos"
                label="Photograph files"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                required
                hint="Up to 24 at a time."
              />
              <Field
                uid={`upload-${album.id}`}
                name="altText"
                label="Description for screen readers"
                defaultValue=""
                hint="Applied to every file in this upload batch; correct any single one below."
              />
              <Field
                uid={`upload-${album.id}`}
                name="containsIdentifiableMinors"
                label="These photographs show an identifiable pupil under 18"
                as="checkbox"
                required
                defaultChecked
                hint="Leave this ticked unless you are sure every face is unrecognisable or out of frame. Ticked means each frame starts as needing a consent answer before anything can publish."
              />
            </ActionForm>
          </>
        ) : (
          <p className="mt-3 text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
            Uploading needs “gallery.edit” and “document.upload”.
          </p>
        )}
      </section>

      <section className="rule mt-10 pt-8">
        <h2 className="text-[1.15rem]">Frames</h2>
        {album.items.length === 0 ? (
          <p className="mt-3 text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
            This album holds nothing yet.
          </p>
        ) : (
          <ul className="mt-4 grid gap-6 sm:grid-cols-2 xl:grid-cols-3" role="list" style={{ listStyle: "none" }}>
            {album.items.map((item) => (
              <li key={item.id} className="card overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/portal/gallery/${item.documentId}`}
                  alt={item.altText || item.caption || `Photograph in ${album.title}`}
                  width={item.widthPx ?? undefined}
                  height={item.heightPx ?? undefined}
                  loading="lazy"
                  decoding="async"
                  style={{
                    display: "block",
                    width: "100%",
                    height: "auto",
                    aspectRatio:
                      item.widthPx && item.heightPx ? `${item.widthPx} / ${item.heightPx}` : "3 / 2",
                    objectFit: "cover",
                    background: "var(--surface-raised)",
                  }}
                />
                <div className="p-4">
                  <p className="text-[0.82rem]" style={{ color: "var(--ink-muted)" }}>
                    {item.widthPx && item.heightPx ? `${item.widthPx} × ${item.heightPx} px` : "size not recorded"}
                    {album.coverDocumentId === item.documentId ? " · cover" : ""}
                    {item.widthPx !== null && item.widthPx < 900 ? " · too small for the homepage slideshow" : ""}
                  </p>

                  <p className="mt-2 text-[0.9rem]">
                    <strong>Consent:</strong>{" "}
                    {item.containsIdentifiableMinors ? CONSENT_LABEL[item.consentStatus] : "not required"}
                    {item.containsIdentifiableMinors && item.consentStatus !== "granted" && (
                      <span style={{ color: "var(--alert)" }}> — blocks publication</span>
                    )}
                  </p>

                  {canVerify && item.containsIdentifiableMinors && (
                    <ActionForm
                      action={setPhotoConsentAction}
                      csrfToken={csrfToken}
                      submitLabel="Record the answer"
                      variant="secondary"
                      small
                      inline
                      hidden={{ id: item.id }}
                      className="mt-3"
                    >
                      <Field
                        uid={`consent-${item.id}`}
                        name="consentStatus"
                        label="Guardian's consent for this frame"
                        as="select"
                        defaultValue={item.consentStatus}
                        options={CONSENT_OPTIONS}
                        hint="Recording any answer here withdraws a clearance already given for the whole album, because the flag means every child was checked."
                      />
                    </ActionForm>
                  )}

                  {canEdit && (
                    <ActionForm
                      action={setPhotoCaptionAction}
                      csrfToken={csrfToken}
                      submitLabel="Save the text"
                      variant="secondary"
                      small
                      hidden={{ id: item.id }}
                      className="mt-4"
                    >
                      <Field
                        uid={`caption-${item.id}`}
                        name="caption"
                        label="Caption"
                        defaultValue={item.caption}
                        rows={2}
                        as="textarea"
                      />
                      <Field uid={`caption-${item.id}`} name="credit" label="Credit" defaultValue={item.credit} />
                      <Field
                        uid={`caption-${item.id}`}
                        name="altText"
                        label="Description for screen readers"
                        defaultValue={item.altText ?? ""}
                        hint="Leave empty to clear it. Say what is in the picture, not “photo of”. "
                      />
                    </ActionForm>
                  )}

                  {canEdit && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <ActionForm
                        action={setAlbumCoverAction}
                        csrfToken={csrfToken}
                        submitLabel="Use as cover"
                        variant="secondary"
                        small
                        inline
                        hidden={{ id: album.id, documentId: item.documentId }}
                      />
                      <ActionForm
                        action={removeAlbumPhotoAction}
                        csrfToken={csrfToken}
                        submitLabel="Remove"
                        variant="danger"
                        small
                        inline
                        confirm="Remove this photograph from the album? The bytes stay on file for the record, and any clearance for the album is withdrawn."
                        hidden={{ id: item.id, confirm: "true" }}
                      />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="pending mt-10">
        <strong>Why the frames are held back.</strong> A photograph lands as a restricted file, and the public image
        route will not serve it. Publishing an album opens its frames; taking it down, removing a frame or changing one
        consent answer closes them again. The homepage slideshow reads the same rows, so a picture cannot stay on the
        largest frame of the site after its album was withdrawn.
      </p>
    </PanelShell>
  );
}
