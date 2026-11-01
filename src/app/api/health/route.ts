import { getDb } from "@/server/db/mongo/client";

/**
 * Liveness and readiness in one answer.
 *
 * Render calls this path to decide whether an instance should receive traffic,
 * so it must touch the database: a process that is up but cannot reach Atlas is
 * not ready to serve a page. It reports a status code and nothing else — the
 * error text could name an internal host, and this URL is public.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await getDb().command({ ping: 1 });
    return Response.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ok: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
