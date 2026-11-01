import { requirePermission } from "@/server/auth/session";
import { failureToResponse } from "@/server/http/respond";
import { serveGalleryPreview } from "@/server/http/file-response";

/**
 * A photograph the content panel is deciding about.
 *
 * The bytes are held back from the public file route until the album passes its
 * consent gate, so the panel needs its own door. It is not a weaker one: the
 * permission is read from the session on the server for every request, and the
 * handler only ever reaches a document that an album references.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requirePermission("gallery.view");
    const { id } = await context.params;
    return await serveGalleryPreview(id);
  } catch (error) {
    return failureToResponse(error);
  }
}
