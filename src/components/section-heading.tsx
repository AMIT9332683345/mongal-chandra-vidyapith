import Link from "next/link";

export function SectionHeading({
  eyebrow,
  title,
  description,
  more,
}: {
  eyebrow?: string;
  title: string;
  description?: string | null;
  more?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="mt-1.5">{title}</h2>
        {description && <p className="lede mt-2">{description}</p>}
      </div>
      {more && (
        <Link
          href={more.href}
          className="text-[0.9rem] font-semibold no-underline hover:underline"
          style={{ color: "var(--accent)" }}
        >
          {more.label} →
        </Link>
      )}
    </div>
  );
}

/**
 * The honest gap. Wherever the school has not yet supplied a fact, the site
 * says so in these words rather than printing something plausible.
 */
export function InfoGap({ label, what }: { label: string; what: string }) {
  return (
    <p className="pending">
      <strong>{label} not published.</strong> {what}
    </p>
  );
}

export function EmptyState({ title, note }: { title: string; note?: string }) {
  return (
    <div
      className="border px-5 py-8 text-center"
      style={{ borderColor: "var(--line)", background: "var(--surface)", borderRadius: "var(--radius)" }}
    >
      <p className="font-semibold" style={{ color: "var(--ink)" }}>
        {title}
      </p>
      {note && (
        <p className="mt-1 text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
          {note}
        </p>
      )}
    </div>
  );
}
