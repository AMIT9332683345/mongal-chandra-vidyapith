"use client";

import { useEffect, useActionState, useRef } from "react";
import type { ActionState } from "@/lib/action-state";

/** A Server Action, as handed down from a server component. */
export type PanelAction = (formData: FormData) => Promise<ActionState>;

/**
 * The one form the content panel uses.
 *
 * It exists once so that three things cannot be forgotten by a page written in a
 * hurry: every submit carries this session's CSRF token, every result is
 * announced to a screen reader as well as shown on the button, and every
 * destructive one asks a question first. The messages come from the server, in
 * the server's own words, because the person who saved something is entitled to
 * be told whether it went public or only into the database.
 */
export function ActionForm({
  action,
  csrfToken,
  submitLabel,
  hidden,
  children,
  confirm,
  variant = "primary",
  small,
  note,
  inline,
  resetOnSuccess,
  editLinkPrefix,
  className,
}: {
  action: PanelAction;
  csrfToken: string;
  submitLabel: string;
  /** Values the action needs that a person should not type: a record id, an intent. */
  hidden?: Record<string, string>;
  children?: React.ReactNode;
  /** Asked before submitting. A delete without it is a phone call to the office. */
  confirm?: string;
  variant?: "primary" | "secondary" | "gold" | "danger";
  small?: boolean;
  note?: string;
  /** A single line of controls for beside a list entry, with no banner above it. */
  inline?: boolean;
  /** Empties the fields after a success, which is what an upload form wants. */
  resetOnSuccess?: boolean;
  /** Offers a link to the record a create just made, when the action returns its id. */
  editLinkPrefix?: string;
  className?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState<ActionState | null, FormData>(
    async (_previous, formData) => action(formData),
    null,
  );

  // Reset only once the server has said yes, so a rejected submission keeps both
  // the message and the typing that caused it.
  useEffect(() => {
    if (resetOnSuccess && state?.ok) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  const errorEntries = Object.entries(state?.errors ?? {});

  return (
    <form
      ref={formRef}
      action={formAction}
      className={className}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      <input type="hidden" name="csrfToken" value={csrfToken} />
      {hidden
        ? Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))
        : null}

      {state && !inline ? (
        <div
          role={state.ok ? "status" : "alert"}
          aria-live="polite"
          className="mb-5 border p-4 text-[0.93rem]"
          style={{
            borderColor: state.ok ? "var(--accent)" : "var(--alert)",
            background: state.ok ? "var(--accent-soft)" : "var(--surface)",
            borderRadius: "var(--radius)",
            color: "var(--ink)",
          }}
        >
          <p>{state.message}</p>
          {errorEntries.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.88rem]" style={{ color: "var(--alert)" }}>
              {errorEntries.map(([field, message]) => (
                <li key={field}>
                  <strong>{field}</strong> — {message}
                </li>
              ))}
            </ul>
          )}
          {state.ok && state.createdId && editLinkPrefix ? (
            <p className="mt-2">
              <a href={`${editLinkPrefix}${state.createdId}`} style={{ color: "var(--accent)", fontWeight: 600 }}>
                Open it and add the details
              </a>
            </p>
          ) : null}
        </div>
      ) : null}

      {children}

      <button type="submit" className={`button button-${variant}${small ? " button-small" : ""}`} disabled={isPending}>
        {isPending ? "Working…" : submitLabel}
      </button>

      {state && inline ? (
        <span
          role={state.ok ? "status" : "alert"}
          aria-live="polite"
          className="ml-3 text-[0.88rem]"
          style={{ color: state.ok ? "var(--accent)" : "var(--alert)" }}
        >
          {state.message}
        </span>
      ) : null}
      {note && (
        <span className="ml-3 text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
          {note}
        </span>
      )}
    </form>
  );
}
