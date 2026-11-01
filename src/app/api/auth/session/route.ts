import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/server/auth/audit";
import { authenticate } from "@/server/auth/login";
import {
  SESSION_COOKIE,
  applySessionCookies,
  clientIp,
  clearSessionCookies,
  createSession,
  hashToken,
  hashIp,
  loadGrants,
  revokeSession,
} from "@/server/auth/session";
import { apiError, apiOk, failureToResponse, fieldErrors } from "@/server/http/respond";

/**
 * Sign-in and sign-out.
 *
 * The response never says whether an address is known to the school. Lockouts,
 * inactive accounts and bad passwords all answer in the same shape, and every
 * attempt is written to the database whether it succeeds or fails.
 */

const credentialsSchema = z.object({
  email: z.string().trim().min(3).max(200),
  password: z.string().min(1).max(200),
  /** Where the form wants to land, after a sign-in that succeeded. */
  next: z.string().max(200).optional(),
});

/**
 * Only a path on this site may follow a sign-in, so `?next=` cannot bounce a
 * freshly authenticated browser to another domain.
 */
function safeNext(value: string | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  return value.slice(0, 160);
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "bad_request", "Expected a JSON body.");
  }

  const parsed = credentialsSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Enter your email address and password.", fieldErrors(parsed.error));
  }

  const ip = clientIp(request.headers);
  const userAgent = request.headers.get("user-agent") ?? undefined;
  const subject = { ipHash: hashIp(ip), userAgent: userAgent ?? null };

  try {
    const outcome = await authenticate(parsed.data.email, parsed.data.password, { ip, userAgent });

    if (!outcome.ok) {
      if (outcome.code === "too_many_requests" || outcome.code === "account_locked") {
        return NextResponse.json(
          { ok: false, error: { code: "try_later", message: outcome.message } },
          {
            status: 429,
            headers: { "Retry-After": String(outcome.retryAfterSeconds ?? 60) },
          },
        );
      }
      return apiError(401, "invalid_credentials", outcome.message);
    }

    const session = await createSession(outcome.user.id, subject);

    // A teacher reaches the staff area rather than the content desk, unless the
    // form asked for a particular page inside this site.
    const grants = await loadGrants(outcome.user.id);
    const redirectTo =
      safeNext(parsed.data.next) ?? (grants.roleKeys.includes("teacher") ? "/teacher" : "/portal");

    return applySessionCookies(
      apiOk({
        user: {
          id: outcome.user.id,
          name: outcome.user.displayName,
          email: outcome.user.email,
          mustChangePassword: outcome.user.mustChangePassword,
        },
        csrfToken: session.csrfToken,
        redirectTo,
      }),
      session,
    );
  } catch (error) {
    return failureToResponse(error);
  }
}

export async function DELETE(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(cookieHeader);
  if (match?.[1]) {
    try {
      await revokeSession(hashToken(decodeURIComponent(match[1])), "signed_out");
    } catch (error) {
      console.error("[auth] sign-out revocation failed:", error);
    }
  }
  await clearSessionCookies();
  await recordAudit({ action: "auth.sign_out", resourceType: "session", summary: "Signed out" });
  return apiOk({ signedOut: true });
}
