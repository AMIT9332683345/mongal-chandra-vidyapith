import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { NoticeList } from "@/components/notice-list";
import { Pagination } from "@/components/pagination";
import { EmptyState } from "@/components/section-heading";
import { pageMetadata } from "@/lib/metadata";
import { countPublicNotices, listNoticeCategories, listPublicNotices } from "@/server/content/site";

export const revalidate = 60;

export const metadata = pageMetadata({
  title: "Notices and announcements",
  description:
    "The school's public notice board: current and pinned notices by category, with the reference number and display period of each.",
  path: "/notices",
});

const PAGE_SIZE = 15;

function readParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export default async function NoticesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const category = readParam(params.category);
  const query = readParam(params.q);
  const requestedPage = Number.parseInt(readParam(params.page) ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const view = readParam(params.view) === "archive" ? "archive" : "board";
  const filter = { categoryKey: category, search: query, expiredOnly: view === "archive" };

  const [categories, total, rows] = await Promise.all([
    listNoticeCategories(),
    countPublicNotices(filter),
    listPublicNotices({ ...filter, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
  ]);

  const archiveHref = view === "archive" ? "/notices" : "/notices?view=archive";

  return (
    <>
      <PageHeader
        eyebrow="Notice board"
        title={view === "archive" ? "Notice archive" : "Notices and announcements"}
        intro={
          view === "archive"
            ? "Notices whose display period has ended. They are kept for reference and remain searchable."
            : "Pinned items appear first. A notice leaves this board once its display period ends; it remains in the archive."
        }
      />

      <section className="shell py-12">
        <p className="mb-6 text-[0.9rem]">
          <Link href={archiveHref} className="font-semibold no-underline hover:underline" style={{ color: "var(--accent)" }}>
            {view === "archive" ? "← Back to the current board" : "Browse the archive of expired notices →"}
          </Link>
        </p>
        <form method="get" className="flex flex-wrap items-end gap-4" action="/notices">
          {view === "archive" && <input type="hidden" name="view" value="archive" />}
          <div className="min-w-56 flex-1">
            <label htmlFor="q">Search the board</label>
            <input id="q" name="q" type="search" defaultValue={query} placeholder="Title or summary" />
          </div>
          <div className="min-w-48">
            <label htmlFor="category">Category</label>
            <select id="category" name="category" defaultValue={category ?? ""}>
              <option value="">All categories</option>
              {categories.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="button button-primary">
            Search
          </button>
          {(category || query) && (
            <Link href={view === "archive" ? "/notices?view=archive" : "/notices"} className="button button-secondary no-underline">
              Clear
            </Link>
          )}
        </form>

        <div className="mt-8">
          {rows.length > 0 ? (
            <NoticeList notices={rows} />
          ) : (
            <EmptyState
              title="No notices match this search"
              note="Try another category, or clear the filters to see the whole board."
            />
          )}
        </div>

        <Pagination basePath="/notices" searchParams={params} page={page} pageSize={PAGE_SIZE} total={total} />
      </section>
    </>
  );
}
