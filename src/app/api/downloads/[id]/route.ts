import { serveStoredFile } from "@/server/http/file-response";

/**
 * A published, publicly visible document — a syllabus PDF, a notice attachment,
 * an admission instruction sheet. Restricted files answer 404 here, the same as
 * an unknown id, so the route cannot be used to enumerate private records.
 */
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return serveStoredFile(id, "attachment");
}
