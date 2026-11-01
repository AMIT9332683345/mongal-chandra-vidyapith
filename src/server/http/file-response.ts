import { findDoc, findDocById, incrementDoc } from "@/server/db/mongo/repository";
import { readDocumentBytes, safeDownloadName } from "@/server/storage/files";

/**
 * Streams a stored file. There is one entry point, so the visibility rule
 * cannot be forgotten by a second route added later.
 *
 * The storage key never appears in a URL: the id is the only handle, and the
 * database decides whether that id is publicly readable. A restricted
 * admission document answers 404 — the same as a document that does not exist —
 * so probing ids cannot map the school's private files.
 */
export async function serveStoredFile(
  id: string,
  disposition: "inline" | "attachment",
): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const document = await findDocById("documents", id);

  if (!document || document.deletedAt || document.status !== "published") {
    return new Response("Not found", { status: 404 });
  }
  if (document.visibility !== "public") return new Response("Not found", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await readDocumentBytes(document);
  } catch (error) {
    console.error(`[files] could not read document ${id}:`, error);
    return new Response("The file is temporarily unavailable.", { status: 503 });
  }

  const filename = safeDownloadName(document.originalFilename);
  await incrementDoc("documents", { id: document.id }, "downloadCount");

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      // Public, but keyed to the id rather than the path so an unlinked private
      // file is never cached by an intermediary.
      "Cache-Control": "public, max-age=300, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * A document a family attached to an admission application.
 *
 * The upload is restricted for life — it belongs to one family and is never
 * public — so the admissions desk needs its own door. The caller has already
 * proved it holds `admission.view`, and this reaches only a file some
 * application actually references, so the route cannot be walked id by id.
 */
export async function serveApplicationDocument(id: string): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const attached = await findDoc("application_documents", { documentId: id }, { projection: { id: 1 } });
  if (!attached) return new Response("Not found", { status: 404 });

  const document = await findDocById("documents", id);
  if (!document || document.deletedAt) return new Response("Not found", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await readDocumentBytes(document);
  } catch (error) {
    console.error(`[files] could not read application document ${id}:`, error);
    return new Response("The file is temporarily unavailable.", { status: 503 });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `inline; filename="${safeDownloadName(document.originalFilename)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * A gallery photograph being edited in the panel, before it is published.
 *
 * An upload waits as `restricted` until its album passes the consent gate, so the
 * public file route will not serve it — and an editor cannot approve a photograph
 * it cannot look at. This answers for exactly one kind of file: a document some
 * album actually references. The caller has already proved it holds `gallery.view`,
 * which is the whole of the authorisation, and the response is marked private and
 * uncacheable so a shared browser does not keep the picture.
 */
export async function serveGalleryPreview(id: string): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const inAnAlbum = await findDoc("gallery_items", { documentId: id }, { projection: { id: 1 } });
  if (!inAnAlbum) return new Response("Not found", { status: 404 });

  const document = await findDocById("documents", id);
  if (!document || document.deletedAt || !document.mimeType.startsWith("image/")) {
    return new Response("Not found", { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await readDocumentBytes(document);
  } catch (error) {
    console.error(`[files] could not read preview ${id}:`, error);
    return new Response("The file is temporarily unavailable.", { status: 503 });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `inline; filename="${safeDownloadName(document.originalFilename)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
