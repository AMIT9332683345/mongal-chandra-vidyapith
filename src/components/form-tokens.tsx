/**
 * The two fields every public form carries.
 *
 * `csrfToken` is the signed anonymous token issued for this page view — read by
 * the server on submit and compared in constant time. `website` is the honeypot:
 * hidden from a person, irresistible to a script.
 */
export function FormTokens({ token, uid }: { token: string; uid: string }) {
  return (
    <>
      <input type="hidden" name="csrfToken" value={token} readOnly />
      <div hidden aria-hidden="true">
        <label htmlFor={`${uid}-honeypot`}>Please leave this field empty</label>
        <input id={`${uid}-honeypot`} name="website" type="text" autoComplete="off" tabIndex={-1} defaultValue="" />
      </div>
    </>
  );
}

/**
 * What a browser form submission came back as.
 *
 * With JavaScript switched off the route redirects here and tells us only which
 * of our own codes applies, so nothing the visitor typed is reflected in the
 * address bar or the page.
 */
const NOTICE_BY_CODE: Record<string, string> = {
  csrf_failed: "The security check on this form expired. Reload the page and send it again.",
  rate_limited: "Too many submissions from this address. Please try again a little later.",
  spam_detected: "The submission could not be accepted.",
  validation_failed: "The message was not sent. Some answers need correcting.",
  rejected: "The submission could not be accepted.",
  server_error: "The submission could not be completed. Please try again.",
  sent: "Thank you. Your message is with the school office.",
};

export function FormNotice({ code }: { code: string }) {
  const sentence = NOTICE_BY_CODE[code];
  if (!sentence) return null;
  const positive = code === "sent";
  return (
    <p
      role={positive ? "status" : "alert"}
      className="mb-6 border p-4 text-[0.95rem]"
      style={{
        borderColor: positive ? "var(--accent)" : "var(--alert)",
        background: positive ? "var(--accent-soft)" : "var(--surface)",
        color: "var(--ink)",
        borderRadius: "var(--radius)",
      }}
    >
      {sentence}
    </p>
  );
}
