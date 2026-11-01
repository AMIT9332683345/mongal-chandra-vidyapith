"use client";

import { useState } from "react";

/**
 * Staff, pupil and guardian sign-in.
 *
 * The form posts JSON to the session endpoint and then moves the browser; the
 * cookie is set by the server, never by script. A wrong address and a wrong
 * password are answered with the same sentence, so the page cannot be used to
 * discover who works here.
 */
export function SignInForm({ next = "/portal" }: { next?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
          next,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok: true; redirectTo?: string }
        | { ok: false; error: { message?: string } }
        | null;

      if (response.ok && payload?.ok) {
        window.location.assign(payload.redirectTo ?? next);
        return;
      }
      setError(
        payload && !payload.ok && payload.error.message
          ? payload.error.message
          : "The sign-in could not be completed.",
      );
    } catch {
      setError("The connection to the school failed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <p className="mb-4">
        <label htmlFor="login-email" className="block">
          Email address
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="mt-1.5"
        />
      </p>
      <p className="mb-4">
        <label htmlFor="login-password" className="block">
          Password
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1.5"
        />
      </p>

      <div aria-live="polite" role="status">
        {error && (
          <p
            role="alert"
            className="mb-4 border p-3 text-[0.94rem]"
            style={{ borderColor: "var(--alert)", borderRadius: "var(--radius)", color: "var(--ink)" }}
          >
            {error}
          </p>
        )}
      </div>

      <p>
        <button type="submit" className="button button-primary" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </p>
    </form>
  );
}
