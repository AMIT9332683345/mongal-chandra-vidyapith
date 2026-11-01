import { Field, SubmitRow } from "@/components/field";
import { JsonForm } from "@/components/json-form";
import { makeCsrfToken } from "@/server/auth/session";

/**
 * The change-password form for a signed-in account.
 *
 * The hidden value is the session-bound security token: the server can derive
 * it from the session it already resolved, but a page on another site cannot
 * read it, so a submission that did not come from this page is refused.
 */
export function ChangePasswordForm({
  sessionId,
  redirectTo = "/portal",
}: {
  sessionId: string;
  redirectTo?: string;
}) {
  return (
    <JsonForm
      action="/api/auth/password"
      successMessage="Your password has been changed. Other devices were signed out."
      redirectTo={redirectTo}
      className="max-w-md"
    >
      <input type="hidden" name="csrfToken" value={makeCsrfToken(sessionId)} />

      <Field
        uid="password"
        name="currentPassword"
        label="Current password"
        type="password"
        autoComplete="current-password"
        required
      />
      <Field
        uid="password"
        name="newPassword"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 12 characters, including a letter and a number or symbol. Long beats clever: a phrase you can type is stronger than P@ssw0rd!."
      />
      <Field
        uid="password"
        name="confirmPassword"
        label="Repeat the new password"
        type="password"
        autoComplete="new-password"
        required
      />

      <SubmitRow label="Change password" note="Changing it signs out every other device." />
    </JsonForm>
  );
}
