import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  AuthenticationError,
  AuthorizationError,
  FORM_TOKEN_HEADER,
  clientIp,
  constantTimeEquals,
  formTokenFromRequest,
  hashIp,
  issueFormToken,
  verifyFormToken,
} from "@/server/auth/session";
import { RateLimitedError, assertRateLimit } from "@/server/http/rate-limit";
import { ApplicationRejectedError } from "@/server/http/errors";
import { FileRejectedError } from "@/server/storage/files";
import { env } from "@/server/config/env";

/**
 * Every endpoint answers in the same shape, and every one of them is masked:
 * an unexpected failure logs the real cause and tells the visitor only that
 * the submission could not be completed. Stack traces and driver messages do
 * not leave the server.
 */

export type ApiErrorBody = {
  ok: false;
  error: { code: string; message: string; fields?: Record<string, string[]> };
};

export function apiError(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string[]>,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ ok: false, error: { code, message, ...(fields ? { fields } : {}) } }, { status });
}

export function apiOk<T extends Record<string, unknown>>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, ...data }, { status });
}

/** Field errors from a Zod parse, keyed by the form field the visitor must fix. */
export function fieldErrors(error: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path.join(".") || "form";
    (out[field] ??= []).push(issue.message);
  }
  return out;
}

export type PublicFormContext = {
  ipHash: string;
  userAgent: string;
};

/**
 * The checks a public, unauthenticated form submission must pass before any
 * record is written: CSRF token, the honeypot field a bot filled in, and the
 * per-address rate limit.
 */
/**
 * A rate-limit answer always carries `Retry-After`, whichever path produced it,
 * so a browser or a waiting script knows how long to wait rather than retrying
 * immediately and hitting the same wall.
 */
function rateLimited(error: RateLimitedError): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: { code: "rate_limited", message: error.message },
    } satisfies ApiErrorBody,
    { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
  );
}

export async function readPublicForm(
  request: Request,
  { action, limit, windowMinutes }: { action: string; limit: number; windowMinutes: number },
): Promise<{ formData: FormData; context: PublicFormContext } | NextResponse> {
  const cookieToken = formTokenFromRequest(request);
  if (!verifyFormToken(cookieToken)) {
    return apiError(403, "csrf_failed", "The form security check failed. Reload the page and try again.");
  }

  const formData = await request.formData();

  if (!cookieToken || !constantTimeEquals(cookieToken, formData.get("csrfToken")?.toString() ?? "")) {
    return apiError(403, "csrf_failed", "The form security check failed. Reload the page and try again.");
  }

  // A hidden field a human never sees. Filled in, it is a bot.
  if ((formData.get("website")?.toString() ?? "").trim() !== "") {
    return apiError(400, "spam_detected", "The submission could not be accepted.");
  }

  const context: PublicFormContext = {
    ipHash: hashIp(clientIp(request.headers)) ?? "unknown",
    userAgent: (request.headers.get("user-agent") ?? "").slice(0, 300),
  };

  try {
    await assertRateLimit({ action, ipHash: context.ipHash, limit, windowMinutes });
  } catch (error) {
    if (error instanceof RateLimitedError) return rateLimited(error);
    throw error;
  }

  return { formData, context };
}

/** The token a server-rendered form embeds in its hidden field. */
export async function currentFormToken(): Promise<string> {
  const incoming = (await headers()).get(FORM_TOKEN_HEADER);
  return incoming && verifyFormToken(incoming) ? incoming : issueFormToken();
}

/* -------------------------------------------------------------------------- */
/* Browser forms and fetch clients                                             */
/* -------------------------------------------------------------------------- */

/**
 * A visitor with JavaScript switched off would otherwise be handed a page of
 * JSON. When the request came from a plain browser form we send them back to the
 * page they were on with a fixed code in the address, which the page turns into
 * a sentence. Only our own codes travel that way — never the submitted text.
 */
function acceptsHtml(request: Request): boolean {
  return (request.headers.get("accept") ?? "").includes("text/html");
}

const CODE_BY_STATUS: Record<number, string> = {
  400: "rejected",
  401: "unauthenticated",
  403: "forbidden",
  422: "validation_failed",
  429: "rate_limited",
  500: "server_error",
};

function backToForm(request: Request, code: string): NextResponse {
  const referer = request.headers.get("referer");
  const target = new URL(referer && referer.startsWith(env.APP_URL) ? referer : "/", env.APP_URL);
  target.searchParams.set("form_error", code);
  return NextResponse.redirect(target, 303);
}

/** A guard response — CSRF, spam, rate limit — in whichever form the caller wants. */
export function guardFailure(request: Request, response: NextResponse): NextResponse {
  if (!acceptsHtml(request)) return response;
  return backToForm(request, CODE_BY_STATUS[response.status] ?? "rejected");
}

/** Translates the domain errors into a response; anything else is logged and masked. */
export function failureToResponse(error: unknown): NextResponse {
  if (error instanceof ApplicationRejectedError) return apiError(error.status, error.code, error.message);
  if (error instanceof AuthenticationError) return apiError(401, "unauthenticated", error.message);
  if (error instanceof AuthorizationError) return apiError(403, "forbidden", error.message);
  if (error instanceof RateLimitedError) return rateLimited(error);
  if (error instanceof FileRejectedError) return apiError(400, "file_rejected", error.message);
  if (error instanceof ZodError) return apiError(422, "validation_failed", "Check the highlighted fields.", fieldErrors(error));

  console.error("[api] unhandled error:", error);
  return apiError(500, "server_error", "The submission could not be completed. Please try again.");
}

/** A failure for a form endpoint: redirect for a browser, field errors for fetch. */
export function formFailure(request: Request, error: unknown): NextResponse {
  const response = failureToResponse(error);
  if (!acceptsHtml(request)) return response;
  return backToForm(request, CODE_BY_STATUS[response.status] ?? "server_error");
}

/** A success for a form endpoint: redirect for a browser, JSON for fetch. */
export function formSuccess(
  request: Request,
  redirectTo: string,
  data: Record<string, unknown>,
): NextResponse {
  if (acceptsHtml(request)) return NextResponse.redirect(new URL(redirectTo, env.APP_URL), 303);
  return apiOk(data);
}
