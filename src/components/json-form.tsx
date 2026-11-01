"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A form that posts to an API route without a page reload.
 *
 * The markup is a plain `<form method="post">` first: without JavaScript the
 * browser submits it and the route answers with a redirect back to this page.
 * With JavaScript the same endpoint is called through `fetch`, and its field
 * errors are painted beside the inputs they belong to. Nothing about the
 * validation lives here — the server checks every value again.
 */
type FieldErrors = Record<string, string[]>;

type State =
  | { phase: "idle" }
  | { phase: "pending" }
  | { phase: "failed"; message: string; fields: FieldErrors }
  | { phase: "sent"; message: string };

const ERROR_MESSAGES: Record<string, string> = {
  csrf_failed: "The security check on this form has expired. Reload the page and submit it again.",
  rate_limited: "Too many submissions from this address. Please try again a little later.",
  spam_detected: "The submission could not be accepted.",
  validation_failed: "Some answers need correcting. They are listed below.",
  server_error: "The submission could not be completed. Please try again.",
};

export function JsonForm({
  action,
  method = "post",
  successMessage,
  redirectTo,
  className,
  children,
}: {
  action: string;
  method?: "post";
  successMessage: string;
  redirectTo?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>({ phase: "idle" });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setState({ phase: "pending" });

    try {
      const response = await fetch(action, { method, body: new FormData(form) });
      let payload: Record<string, unknown> | null = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (response.ok && payload?.ok) {
        const target = typeof payload.redirectTo === "string" ? payload.redirectTo : redirectTo;
        if (target) {
          window.location.assign(target);
          return;
        }
        form.reset();
        setState({ phase: "sent", message: successMessage });
        return;
      }

      const error = (payload?.error ?? null) as { code?: string; message?: string; fields?: FieldErrors } | null;
      const message =
        error?.message ??
        (error?.code ? ERROR_MESSAGES[error.code] : undefined) ??
        ERROR_MESSAGES.server_error;
      setState({ phase: "failed", message, fields: error?.fields ?? {} });
    } catch {
      setState({
        phase: "failed",
        message: "The connection to the school failed. Please check your network and try again.",
        fields: {},
      });
    }
  }

  // Focus follows the failure so a keyboard and screen-reader user is taken to
  // the explanation rather than left where they were.
  useEffect(() => {
    if (state.phase === "failed") statusRef.current?.focus();
  }, [state.phase]);

  const fieldErrors = state.phase === "failed" ? state.fields : {};

  return (
    <form ref={formRef} action={action} method={method} onSubmit={onSubmit} noValidate className={className}>
      <fieldset
        disabled={state.phase === "pending"}
        className="contents"
        style={{ border: 0, padding: 0, margin: 0 }}
      >
        {children}

        <div ref={statusRef} tabIndex={-1} className="mt-5 outline-none">
          {state.phase === "sent" && (
            <p role="status" className="border p-4 text-[0.95rem]" style={{ borderColor: "var(--accent)", color: "var(--ink)", background: "var(--accent-soft)", borderRadius: "var(--radius)" }}>
              {state.message}
            </p>
          )}
          {state.phase === "failed" && (
            <div
              role="alert"
              className="border p-4"
              style={{ borderColor: "var(--alert)", background: "var(--surface)", borderRadius: "var(--radius)" }}
            >
              <p className="font-semibold" style={{ color: "var(--urgent)" }}>
                {state.message}
              </p>
              {Object.keys(fieldErrors).length > 0 && (
                <ul className="mt-2 mb-0 pl-5 text-[0.9rem]" style={{ color: "var(--ink-secondary)" }}>
                  {Object.entries(fieldErrors).map(([field, messages]) => (
                    <li key={field}>
                      <a href={`#${field}`} className="underline">
                        {field}
                      </a>
                      : {messages.join(" ")}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {state.phase === "pending" && (
            <p role="status" className="text-[0.9rem]" style={{ color: "var(--ink-muted)" }}>
              Sending…
            </p>
          )}
        </div>
      </fieldset>
    </form>
  );
}
