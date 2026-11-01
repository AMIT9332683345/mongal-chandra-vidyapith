import Link from "next/link";
import { SIGN_IN_HREF } from "@/lib/navigation";

/**
 * A quiet line pointing at the protected part of the site.
 *
 * Anything a school cannot publish openly — an individual marksheet, a
 * timetable, a fee statement — is described here and signed for in the portal.
 * The public page states what exists behind the login; it never shows a sample
 * of somebody else's record.
 */
export function PortalNote({ children }: { children?: React.ReactNode }) {
  return (
    <p className="mt-3 text-[0.88rem]" style={{ color: "var(--ink-muted)" }}>
      {children}{" "}
      <Link href={SIGN_IN_HREF} className="font-semibold no-underline hover:underline" style={{ color: "var(--accent)" }}>
        Sign in to the school portal →
      </Link>
    </p>
  );
}
