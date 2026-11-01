import { NextResponse } from "next/server";
import { z } from "zod";
import { lookupApplicationStatus } from "@/server/admissions/service";
import { apiError, apiOk, guardFailure, readPublicForm } from "@/server/http/respond";
import { noteFormAttempt } from "@/server/http/rate-limit";

/**
 * Public progress check for one application.
 *
 * Two things are needed and both must match: the reference number the family
 * was given and the applicant's date of birth. The database is searched by a
 * hash of that pair, so a wrong guess returns the same answer as an unknown
 * reference and no list of applications is ever reachable.
 */
export const runtime = "nodejs";

const lookupSchema = z.object({
  referenceNumber: z
    .string()
    .trim()
    .min(6, "Enter the reference number from your confirmation")
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, "Enter the reference number exactly as it was given"),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the applicant's date of birth"),
});

export async function POST(request: Request): Promise<Response> {
  const guarded = await readPublicForm(request, {
    action: "admission.status_lookup",
    limit: 10,
    windowMinutes: 30,
  });
  if (guarded instanceof NextResponse) return guardFailure(request, guarded);

  const parsed = lookupSchema.safeParse({
    referenceNumber: guarded.formData.get("referenceNumber") ?? "",
    dateOfBirth: guarded.formData.get("dateOfBirth") ?? "",
  });

  if (!parsed.success) {
    await noteFormAttempt({
      action: "admission.status_lookup",
      ...guarded.context,
      reason: "malformed_request",
    });
    return apiError(
      422,
      "validation_failed",
      "Check the reference number and the date of birth.",
      Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), [issue.message]])),
    );
  }

  const status = await lookupApplicationStatus(parsed.data.referenceNumber, parsed.data.dateOfBirth);

  await noteFormAttempt({
    action: "admission.status_lookup",
    ...guarded.context,
    // Every lookup is counted, found or not: this is the endpoint a guesser
    // would attack, and the trail of attempts is what throttles it.
    reason: status ? "matched" : "not_found",
  });
  if (!status) {
    return apiError(
      404,
      "not_found",
      "No application matches that reference number and date of birth. Check both, or contact the office.",
    );
  }

  return apiOk({ status });
}
