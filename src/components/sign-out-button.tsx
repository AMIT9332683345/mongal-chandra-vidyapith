"use client";

import { useState } from "react";

/** Ends this session on the server, then returns to the sign-in page. */
export function SignOutButton() {
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } finally {
      // The session is revoked server-side whatever the browser sees back, so
      // the page still leaves the portal.
      window.location.assign("/signin");
    }
  }

  return (
    <button type="button" className="button button-secondary" onClick={onClick} disabled={pending}>
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
