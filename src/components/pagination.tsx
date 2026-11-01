import Link from "next/link";

function pageHref(basePath: string, params: URLSearchParams, page: number): string {
  const next = new URLSearchParams(params);
  if (page <= 1) next.delete("page");
  else next.set("page", String(page));
  const query = next.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/**
 * Server-rendered links, so a listing works with JavaScript disabled and a
 * crawler can reach every page of the board.
 */
export function Pagination({
  basePath,
  searchParams,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string" && key !== "page") params.set(key, value);
  }

  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;

  const windowStart = Math.max(2, Math.min(page - 1, pages - 2));
  const numbers = Array.from(new Set([1, windowStart, windowStart + 1, pages])).filter(
    (n) => n >= 1 && n <= pages,
  );

  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center gap-2 text-[0.9rem]">
      {page > 1 && (
        <Link href={pageHref(basePath, params, page - 1)} className="button button-secondary" style={{ padding: "0.45rem 0.8rem" }}>
          Previous
        </Link>
      )}
      <ol className="flex list-none items-center gap-1">
        {numbers.map((n) => (
          <li key={n}>
            {n === page ? (
              <span
                aria-current="page"
                className="inline-block border px-3 py-1.5"
                style={{ borderColor: "var(--accent)", color: "var(--ink)", borderRadius: "var(--radius)" }}
              >
                {n}
              </span>
            ) : (
              <Link
                href={pageHref(basePath, params, n)}
                className="inline-block px-3 py-1.5 no-underline hover:underline"
                style={{ color: "var(--ink-secondary)" }}
              >
                {n}
              </Link>
            )}
          </li>
        ))}
      </ol>
      {page < pages && (
        <Link href={pageHref(basePath, params, page + 1)} className="button button-secondary" style={{ padding: "0.45rem 0.8rem" }}>
          Next
        </Link>
      )}
      <span className="ml-auto text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
        {total} item{total === 1 ? "" : "s"} · page {page} of {pages}
      </span>
    </nav>
  );
}
