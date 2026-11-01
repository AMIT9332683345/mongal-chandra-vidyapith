import { NextResponse } from "next/server";
import { formValues } from "@/lib/form-values";
import { submitEnquiry } from "@/server/contact/service";
import { formFailure, formSuccess, guardFailure, readPublicForm } from "@/server/http/respond";

/**
 * The contact and admission enquiry desk.
 *
 * Bots are stopped by the honeypot and the per-address limit inside
 * `readPublicForm`; a person is stopped only by the checks on the fields
 * themselves. Nothing is echoed back to the visitor — the office reads the row
 * in the dashboard.
 */
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const guarded = await readPublicForm(request, {
    action: "contact.enquiry_received",
    limit: 5,
    windowMinutes: 60,
  });
  if (guarded instanceof NextResponse) return guardFailure(request, guarded);

  const values = formValues(guarded.formData);
  // Both of these are ours, not the visitor's answer.
  delete values.csrfToken;
  delete values.website;

  try {
    const result = await submitEnquiry(values, guarded.context);
    return formSuccess(request, "/contact?form_status=sent", {
      enquiryId: result.id,
      // Honest, because no mail transport is wired unless SMTP is configured.
      acknowledgementEmailQueued: result.acknowledgementEmailQueued,
    });
  } catch (error) {
    return formFailure(request, error);
  }
}
