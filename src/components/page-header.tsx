import Link from "next/link";

/**
 * Every public section opens with the same navy banner and breadcrumb, so the
 * site reads as one publication rather than a set of pages. The text is the
 * school's own or a stated absence — the banner never carries a sentence the
 * platform invented.
 */
export function PageHeader({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string;
  title: string;
  intro?: string | null;
}) {
  return (
    <div className="page-banner">
      <div className="shell pb-10 pt-8 lg:pb-14 lg:pt-10">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <span>{title}</span>
        </nav>
        <p className="eyebrow mt-5" style={{ color: "var(--gold)" }}>
          {eyebrow}
        </p>
        <h1 className="mt-2 max-w-4xl">{title}</h1>
        {intro && <p className="lede mt-4 max-w-3xl">{intro}</p>}
      </div>
    </div>
  );
}
