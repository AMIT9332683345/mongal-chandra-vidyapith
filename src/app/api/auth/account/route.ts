import { z } from "zod";
import { recordAuditFor } from "@/server/auth/audit";
import { changeOwnEmail } from "@/server/auth/change-email";
import {
  AuthenticationError,
  applySessionCookies,
  clientIp,
  constantTimeEquals,
  createSession,
  hashIp,
  makeCsrfToken,
  resolvePrincipal,
  revokeAllSessions,
  sessionTokenFromRequest,
} from "@/server/auth/session";
import { assertRateLimit } from "@/server/http/rate-limit";
import { apiError, fieldErrors, formFailure, formSuccess, guardFailure } from "@/server/http/respond";

/**
 * A signed-in account changing its own sign-in address.
 *
 * The order is the same as the password endpoint: session, token, shape,
 * throttle, and only then the scrypt comparison. The current password is
 * required because an unattended browser must not be able to move an account to
 * an address the owner does not control. Every session is replaced afterwards.
 */

export const runtime = "nodejs";

const FAILED_ACTION = "auth.email_change_failed";
const MAX_FAILED_ATTEMPTS = 8;
const WINDOW_MINUTES = 15;

const formSchema = z.object({
  currentPassword: z.string().min(1, "Enter the password you use now.").max(200),
  newEmail: z.string().trim().min(5, "Enter the new email address.").max(200),
});

function readFormValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  const principal = await resolvePrincipal(sessionTokenFromRequest(request));
  if (!principal) return formFailure(request, new AuthenticationError("Sign in before changing an account"));

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return guardFailure(request, apiError(400, "bad_request", "This form must be submitted from the page."));
  }

  const suppliedToken = readFormValue(formData, "csrfToken");
  if (!suppliedToken || !constantTimeEquals(suppliedToken, makeCsrfToken(principal.sessionId))) {
    return guardFailure(
      request,
      apiError(403, "csrf_failed", "The form security check failed. Reload the page and try again."),
    );
  }

  const parsed = formSchema.safeParse({
    currentPassword: readFormValue(formData, "currentPassword"),
    newEmail: readFormValue(formData, "newEmail"),
  });
  if (!parsed.success) {
    return guardFailure(
      request,
      apiError(422, "validation_failed", "Check the highlighted fields.", fieldErrors(parsed.error)),
    );
  }

  const ipHash = hashIp(clientIp(request.headers)) ?? "unknown";
  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 300);

  try {
    await assertRateLimit({
      action: FAILED_ACTION,
      ipHash,
      limit: MAX_FAILED_ATTEMPTS,
      windowMinutes: WINDOW_MINUTES,
    });
  } catch (error) {
    return formFailure(request, error);
  }

  const outcome = await changeOwnEmail({
    userId: principal.userId,
    currentPassword: parsed.data.currentPassword,
    newEmail: parsed.data.newEmail,
  });

  if (!outcome.ok) {
    if (outcome.code === "wrong_password") {
      await recordAuditFor(principal, {
        action: FAILED_ACTION,
        resourceType: "user",
        resourceId: principal.userId,
        summary: "An email change was refused because the current password did not match",
        ipHash,
        userAgent,
      });
      return guardFailure(request, apiError(401, "invalid_credentials", outcome.message));
    }
    return guardFailure(request, apiError(422, "validation_failed", outcome.message, outcome.fields));
  }

  // The old address must stop working everywhere at once; this browser is given
  // a fresh session so the person is not signed out for doing the right thing.
  await revokeAllSessions(principal.userId, "email_changed");
  const session = await createSession(principal.userId, { ipHash, userAgent: userAgent || null });

  await recordAuditFor(principal, {
    action: "auth.email_changed",
    resourceType: "user",
    resourceId: principal.userId,
    summary: "Sign-in address changed by the account holder",
    metadata: { email: outcome.email },
    ipHash,
    userAgent,
  });

  return applySessionCookies(
    formSuccess(request, "/portal/account?emailChanged=1", { emailChanged: true, email: outcome.email }),
    session,
  );
}
