import Link from "next/link";
import type { PublicNotice } from "@/server/content/site";
import { formatDate } from "@/lib/format";

/**
 * Rows, not cards. The board is read as a list of dated items, which is how a
 * school's circular file actually works.
 */
export function NoticeList({ notices, compact = false }: { notices: PublicNotice[]; compact?: boolean }) {
  return (
    <ul className="flex list-none flex-col">
      {notices.map((notice) => (
        <li
          key={notice.id}
          className="flex flex-col gap-1 border-b py-3.5 last:border-b-0 sm:flex-row sm:gap-5"
          style={{ borderColor: "var(--line)" }}
        >
          <span
            className="shrink-0 text-[0.82rem] tabular-nums"
            style={{ color: "var(--ink-muted)", minWidth: "6.5rem" }}
          >
            {formatDate(notice.issuedOn) ?? "Date to be confirmed"}
          </span>
          <div className="min-w-0">
            <Link
              href={`/notices/${notice.slug}`}
              className="font-[family-name:var(--font-heading)] text-[1.02rem] font-semibold no-underline hover:underline"
              style={{ color: "var(--ink)" }}
            >
              {notice.title}
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.78rem]" style={{ color: "var(--ink-muted)" }}>
              {notice.isEmergency && (
                <span className="tag" style={{ borderColor: "var(--urgent)", color: "var(--urgent)" }}>
                  Emergency
                </span>
              )}
              {notice.pinned && <span className="tag">Pinned</span>}
              {notice.categoryName && <span className="tag">{notice.categoryName}</span>}
              {notice.referenceNumber && <span className="tabular-nums">Ref. {notice.referenceNumber}</span>}
              {notice.expiresOn && <span>Display until {formatDate(notice.expiresOn)}</span>}
            </div>
            {!compact && notice.summary && (
              <p className="mt-1.5 text-[0.93rem]" style={{ color: "var(--ink-secondary)" }}>
                {notice.summary}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
