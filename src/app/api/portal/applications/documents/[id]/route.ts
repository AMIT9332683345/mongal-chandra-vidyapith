import { requirePermission } from "@/server/auth/session";
import { failureToResponse } from "@/server/http/respond";
import { serveApplicationDocument } from "@/server/http/file-response";

/**
 * A document a family attached to an admission application.
 *
 * The permission is asked of the server on every request, and the handler only
 * reaches a document an application references, so this is not a weaker door
 * than the public one — it is the same rule applied to a private record.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requirePermission("admission.view");
    const { id } = await context.params;
    return await serveApplicationDocument(id);
  } catch (error) {
    return failureToResponse(error);
  }
}
