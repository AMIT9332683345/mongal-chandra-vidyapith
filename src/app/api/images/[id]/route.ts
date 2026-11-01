import { serveStoredFile } from "@/server/http/file-response";

/**
 * A public gallery photograph. Identical to the download route except that the
 * browser is allowed to render it inline; the visibility check lives in
 * `serveStoredFile`, so neither route can be talked into returning a
 * restricted file.
 */
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return serveStoredFile(id, "inline");
}
