import { z } from "zod";
import { recordAuditFor } from "@/server/auth/audit";
import { changeOwnPassword } from "@/server/auth/change-password";
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
 * A signed-in account changing its own password.
 *
 * The state-changing checks run in the order that costs least: session, token,
 * shape, throttle — and only then the scrypt comparison, which is the one an
 * attacker can make expensive. A refused attempt is written to the audit trail,
 * which is also what the throttle counts.
 */

export const runtime = "nodejs";

/** Action the throttle counts; a rejected guess is recorded under it. */
const FAILED_ACTION = "auth.password_change_failed";
const MAX_FAILED_ATTEMPTS = 8;
const WINDOW_MINUTES = 15;

const formSchema = z.object({
  currentPassword: z.string().min(1, "Enter the password you use now.").max(200),
  newPassword: z.string().min(1, "Choose a new password.").max(200),
  confirmPassword: z.string().min(1, "Type the new password once more.").max(200),
});

function readFormValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  const principal = await resolvePrincipal(sessionTokenFromRequest(request));
  if (!principal) return formFailure(request, new AuthenticationError("Sign in before changing a password"));

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
    newPassword: readFormValue(formData, "newPassword"),
    confirmPassword: readFormValue(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return guardFailure(
      request,
      apiError(422, "validation_failed", "Check the highlighted fields.", fieldErrors(parsed.error)),
    );
  }

  if (parsed.data.newPassword !== parsed.data.confirmPassword) {
    return guardFailure(
      request,
      apiError(422, "validation_failed", "The two new passwords do not match.", {
        confirmPassword: ["Type the new password again exactly as you entered it above."],
      }),
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

  const outcome = await changeOwnPassword({
    userId: principal.userId,
    currentPassword: parsed.data.currentPassword,
    newPassword: parsed.data.newPassword,
  });

  if (!outcome.ok) {
    if (outcome.code === "wrong_password") {
      await recordAuditFor(principal, {
        action: FAILED_ACTION,
        resourceType: "user",
        resourceId: principal.userId,
        summary: "A password change was refused because the current password did not match",
        ipHash,
        userAgent,
      });
      return guardFailure(request, apiError(401, "invalid_credentials", outcome.message));
    }
    return guardFailure(request, apiError(422, "validation_failed", outcome.message, outcome.fields));
  }

  // Every other device is signed out; this one is handed a fresh session, so
  // the visitor is not punished for doing the right thing.
  await revokeAllSessions(principal.userId, "password_changed");
  const session = await createSession(principal.userId, { ipHash, userAgent: userAgent || null });

  await recordAuditFor(principal, {
    action: "auth.password_changed",
    resourceType: "user",
    resourceId: principal.userId,
    summary: "Password changed by the account holder",
    ipHash,
    userAgent,
  });

  return applySessionCookies(formSuccess(request, "/portal", { changed: true, mustChangePassword: false }), session);
}
