import { NextResponse } from "next/server";
import { z } from "zod";
import { formValues } from "@/lib/form-values";
import { submitApplication } from "@/server/admissions/service";
import { noteFormAttempt } from "@/server/http/rate-limit";
import { formFailure, formSuccess, guardFailure, readPublicForm } from "@/server/http/respond";

/**
 * An admission application from the public form.
 *
 * The uploaded proofs are stored restricted and never listed back: the answer
 * to the visitor is the reference number, and the reference number alone is not
 * enough to read the file — the status lookup asks for the date of birth as
 * well.
 */
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const guarded = await readPublicForm(request, {
    action: "admission.application_submitted",
    // A family may legitimately resubmit after a power cut, but not in volume.
    limit: 3,
    windowMinutes: 12 * 60,
  });
  if (guarded instanceof NextResponse) return guardFailure(request, guarded);

  const values = formValues(guarded.formData);
  delete values.csrfToken;
  delete values.website;
  // `documentTypes` arrives alongside the files; the service reads them from the
  // raw FormData, so they are not part of the field validation.
  delete values.documentTypes;

  try {
    const result = await submitApplication(values, {
      ...guarded.context,
      formData: guarded.formData,
    });
    return formSuccess(request, `/admissions/applied?ref=${encodeURIComponent(result.referenceNumber)}`, {
      referenceNumber: result.referenceNumber,
      submittedAt: result.submittedAt.toISOString(),
      applyingClassName: result.applyingClassName,
      documentCount: result.documents.length,
    });
  } catch (error) {
    // A submission the service refused still counts against the address, so
    // guessing at the form is not cheaper than filling it in.
    if (error instanceof z.ZodError) {
      await noteFormAttempt({
        action: "admission.application_submitted",
        ...guarded.context,
        reason: "validation_failed",
      });
    }
    return formFailure(request, error);
  }
}
