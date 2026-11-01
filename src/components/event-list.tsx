import Link from "next/link";
import { dayMonth, formatDate, formatDateTime } from "@/lib/format";

type EventRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  venue: string | null;
  occurrenceState: string;
  categoryName: string | null;
};

function when(row: EventRow): string {
  if (row.allDay) return formatDate(row.startsAt) ?? "";
  return formatDateTime(row.startsAt) ?? "";
}

/**
 * A date block plus a line of text. The month grid on /events reuses the same
 * row so an event looks identical wherever it appears.
 */
export function EventRowItem({ row }: { row: EventRow }) {
  const { day, month } = dayMonth(row.startsAt);
  return (
    <li className="flex gap-4 border-b py-4 last:border-b-0" style={{ borderColor: "var(--line)" }}>
      <span
        aria-hidden="true"
        className="grid h-14 w-14 shrink-0 place-content-center border text-center"
        style={{ borderColor: "var(--line)", borderRadius: "var(--radius)", background: "var(--surface-raised)" }}
      >
        <span className="block font-[family-name:var(--font-heading)] text-[1.05rem] font-semibold leading-none" style={{ color: "var(--ink)" }}>
          {day}
        </span>
        <span className="mt-0.5 block text-[0.68rem] uppercase tracking-[0.12em]" style={{ color: "var(--accent)" }}>
          {month}
        </span>
      </span>
      <div className="min-w-0">
        <Link
          href={`/events/${row.slug}`}
          className="font-[family-name:var(--font-heading)] text-[1.02rem] font-semibold no-underline hover:underline"
          style={{ color: "var(--ink)" }}
        >
          {row.title}
        </Link>
        <p className="mt-0.5 text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
          {when(row)}
          {row.venue ? ` · ${row.venue}` : ""}
          {row.categoryName ? ` · ${row.categoryName}` : ""}
        </p>
        {row.summary && (
          <p className="mt-1.5 text-[0.93rem]" style={{ color: "var(--ink-secondary)" }}>
            {row.summary}
          </p>
        )}
      </div>
    </li>
  );
}

export function EventList({ events }: { events: EventRow[] }) {
  return (
    <ul className="flex list-none flex-col">
      {events.map((row) => (
        <EventRowItem key={row.id} row={row} />
      ))}
    </ul>
  );
}
