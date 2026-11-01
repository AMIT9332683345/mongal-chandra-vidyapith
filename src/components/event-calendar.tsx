import Link from "next/link";

type CalendarEvent = {
  id: string;
  slug: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  venue: string | null;
  categoryName: string | null;
};

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** `2026-10` → the first of that month, in local time. */
export function monthStart(month: string | undefined): Date {
  const match = /^(\d{4})-(\d{2})$/.exec(month ?? "");
  if (match) {
    const year = Number(match[1]);
    const index = Number(match[2]);
    if (index >= 1 && index <= 12) return new Date(year, index - 1, 1);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(date);
}

function key(year: number, month: number, day: number): string {
  return `${year}-${`${month + 1}`.padStart(2, "0")}-${`${day}`.padStart(2, "0")}`;
}

function localDay(value: Date): string {
  return key(value.getFullYear(), value.getMonth(), value.getDate());
}

/**
 * A month grid built on the server, so the calendar is readable without
 * JavaScript and search engines can see the dated links. Weeks start on Monday
 * and each cell is a list, never a decorative card.
 */
export function EventCalendar({
  events,
  month,
  basePath = "/events",
  extraParams = "",
}: {
  events: CalendarEvent[];
  month: Date;
  basePath?: string;
  extraParams?: string;
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  // Monday-first offset for the 1st of the month.
  const leading = (new Date(year, monthIndex, 1).getDay() + 6) % 7;

  const byDay = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const lastDay = event.allDay && event.endsAt ? localDay(event.endsAt) : localDay(event.startsAt);
    let cursor = localDay(event.startsAt);
    let guard = 0;
    while (cursor <= lastDay && guard < 31) {
      const bucket = byDay.get(cursor) ?? [];
      bucket.push(event);
      byDay.set(cursor, bucket);
      const [y, m, d] = cursor.split("-").map(Number);
      cursor = key(y ?? year, (m ?? monthIndex + 1) - 1, (d ?? 1) + 1);
      guard += 1;
    }
  }

  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const previous = new Date(year, monthIndex - 1, 1);
  const next = new Date(year, monthIndex + 1, 1);
  const param = (date: Date) =>
    `${basePath}?month=${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}${extraParams}`;

  const today = localDay(new Date());

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-[family-name:var(--font-heading)] text-[1.4rem] font-semibold" style={{ color: "var(--ink)" }}>
          {monthLabel(month)}
        </h2>
        <nav aria-label="Calendar months" className="flex gap-2">
          <Link href={param(previous)} className="button button-secondary" style={{ padding: "0.4rem 0.8rem" }}>
            Previous month
          </Link>
          <Link href={param(new Date())} className="button button-secondary" style={{ padding: "0.4rem 0.8rem" }}>
            This month
          </Link>
          <Link href={param(next)} className="button button-secondary" style={{ padding: "0.4rem 0.8rem" }}>
            Next month
          </Link>
        </nav>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="border-collapse" style={{ tableLayout: "fixed", minWidth: "46rem" }}>
          <caption className="sr-only">
            Events in {monthLabel(month)}, arranged as a month grid with the week starting on Monday
          </caption>
          <thead>
            <tr>
              {WEEKDAYS.map((day) => (
                <th key={day} scope="col" className="w-[14.28%] border-b py-2 text-[0.8rem] font-semibold" style={{ borderColor: "var(--line)" }}>
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chunk(cells, 7).map((week, weekIndex) => (
              <tr key={weekIndex}>
                {week.map((day, dayIndex) => {
                  const cellKey = day ? key(year, monthIndex, day) : "";
                  const items = day ? (byDay.get(cellKey) ?? []) : [];
                  return (
                    <td
                      key={dayIndex}
                      className="h-24 border-b align-top"
                      style={{ borderColor: "var(--line)", background: day && cellKey === today ? "var(--accent-soft)" : undefined }}
                    >
                      {day && (
                        <div className="flex h-full flex-col gap-1 p-1.5">
                          <span className="text-[0.8rem] tabular-nums" style={{ color: "var(--ink-muted)" }}>
                            {day}
                          </span>
                          <ul className="flex list-none flex-col gap-1 overflow-hidden">
                            {items.slice(0, 2).map((event) => (
                              <li key={event.id}>
                                <Link
                                  href={`/events/${event.slug}`}
                                  className="block truncate border-l-2 pl-1.5 text-[0.78rem] font-medium leading-snug no-underline hover:underline"
                                  style={{ borderColor: "var(--accent)", color: "var(--ink)" }}
                                  title={event.title}
                                >
                                  {event.title}
                                </Link>
                              </li>
                            ))}
                            {items.length > 2 && (
                              <li className="text-[0.75rem]" style={{ color: "var(--ink-muted)" }}>
                                +{items.length - 2} more
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}
