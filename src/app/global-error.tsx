"use client";

/**
 * Last line of defence.
 *
 * When the failure happens in the root layout itself — the database is
 * unreachable, the stylesheets never loaded — there is no chrome left to render
 * and no CSS to style this with. So it carries its own inline styling, follows
 * the visitor's system theme, and prints a reference instead of the error text,
 * which can contain a connection string or a server path.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>The school website could not be displayed</title>
        <style>{`
          body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.7;
                 color: #1c1f1b; background: #ffffff; }
          h1 { margin: .5rem 0 0; font-size: 1.9rem; line-height: 1.2; letter-spacing: -.01em; }
          p { margin: 1rem 0 0; color: #41463d; }
          .muted { font-size: .85rem; color: #6b7066; }
          main { max-width: 36rem; margin: 0 auto; padding: 4rem 1.25rem; }
          button { cursor: pointer; padding: .6rem 1.1rem; border: 1px solid #c8ccc2; background: #1c1f1b;
                   color: #fff; border-radius: 3px; font: inherit; }
          @media (prefers-color-scheme: dark) {
            body { color: #eceee8; background: #0d0f0c; }
            p, .muted { color: #b7bbb2; }
            h1 { color: #f2f4ef; }
            button { background: #f2f4ef; color: #0d0f0c; border-color: #3a3f38; }
          }
        `}</style>
      </head>
      <body>
        <main>
          <p className="muted" style={{ fontSize: "0.78rem", letterSpacing: "0.14em", textTransform: "uppercase", margin: 0 }}>
            Service problem
          </p>
          <h1>This page could not be displayed</h1>
          <p>
            The school website could not reach the information it needed to draw this page. Nothing you did caused it,
            and no details you may have entered were saved. Please try again in a moment.
          </p>
          {error.digest && (
            <p className="muted">
              Reference for the office: <code style={{ fontFamily: "ui-monospace, monospace" }}>{error.digest}</code>
            </p>
          )}
          <p>
            <button type="button" onClick={() => reset()}>
              Try again
            </button>
          </p>
          <p style={{ fontSize: "0.9rem" }}>
            If the school office has telephoned or emailed you a link, ask them to confirm it by telephone instead.
          </p>
        </main>
      </body>
    </html>
  );
}
