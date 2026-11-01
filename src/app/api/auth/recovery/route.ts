import { NextResponse } from "next/server";
import { z } from "zod";
import { requestAccountRecovery } from "@/server/auth/recovery";
import { formFailure, formSuccess, guardFailure, readPublicForm } from "@/server/http/respond";

/**
 * The public "forgot username or password" form.
 *
 * It answers the same way for an address that exists and one that does not: the
 * request is written down for the school office either way, and only an
 * administrator looking at the queue learns whether a row matched. That is
 * deliberate — a recovery form that says "no account with that address" is an
 * account-enumeration tool with a friendly face.
 */

export const runtime = "nodejs";

const formSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(3, "Enter the email address or the name the account is under.")
    .max(200),
});

export async function POST(request: Request): Promise<Response> {
  const guarded = await readPublicForm(request, {
    action: "auth.recovery_request",
    limit: 5,
    windowMinutes: 60,
  });
  if (guarded instanceof NextResponse) return guardFailure(request, guarded);

  const parsed = formSchema.safeParse({
    identifier: guarded.formData.get("identifier")?.toString() ?? "",
  });
  if (!parsed.success) {
    const messages: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "identifier";
      (messages[key] ??= []).push(issue.message);
    }
    return guardFailure(
      request,
      NextResponse.json(
        { ok: false, error: { code: "validation_failed", message: "Check the field below.", fields: messages } },
        { status: 422 },
      ),
    );
  }

  try {
    await requestAccountRecovery({
      identifier: parsed.data.identifier,
      ipHash: guarded.context.ipHash,
      userAgent: guarded.context.userAgent,
    });
    return formSuccess(request, "/forgot?form_status=sent", { received: true });
  } catch (error) {
    return formFailure(request, error);
  }
}
