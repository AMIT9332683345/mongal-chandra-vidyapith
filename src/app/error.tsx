"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * A server error is reported, not hidden, but what is shown is the reference
 * the office needs to investigate — never the stack trace, the SQL, or a file
 * path from the server. The error itself goes to the browser console and to the
 * platform's own logs.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[site] render error:", error);
  }, [error]);

  return (
    <div className="shell-narrow py-16 text-center">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="mt-2">This section could not be loaded</h1>
      <p className="lede mt-3">
        The rest of the site is unaffected. Try again; if it happens a second time, quote the reference below to the
        office and they can look up exactly what happened.
      </p>
      {error.digest && (
        <p className="mt-4 inline-block text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
          Reference: <code>{error.digest}</code>
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" className="button button-primary" onClick={() => reset()}>
          Try again
        </button>
        <Link href="/" className="button button-secondary">
          Back to the home page
        </Link>
        <Link href="/contact" className="button button-secondary">
          Report the problem
        </Link>
      </div>
    </div>
  );
}
