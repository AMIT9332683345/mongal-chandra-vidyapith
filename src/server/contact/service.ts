import { z } from "zod";
import { recordAudit } from "@/server/auth/audit";
import { insertDoc } from "@/server/db/mongo/repository";
import { env } from "@/server/config/env";

/**
 * The public enquiry desk.
 *
 * A message is stored as a row the office can answer from the dashboard. What
 * happens next is deliberately not promised: an acknowledgement email is
 * recorded as *not sent* when no mail account is configured, because telling a
 * parent "we have emailed you" when nothing left the server is worse than
 * saying nothing.
 */

const ENQUIRY_KINDS = ["general", "admission", "transport", "feedback", "media"] as const;

export const enquirySchema = z.object({
  kind: z.enum(ENQUIRY_KINDS).default("general"),
  name: z.string().trim().min(2, "Enter your name").max(120),
  email: z.string().trim().email("Enter an email address we can reply to").max(200),
  /**
   * Optional in the form, so a blank field is absent rather than an empty
   * string. `transform` runs either way, which keeps one shape for the insert.
   */
  phone: z
    .string()
    .trim()
    .optional()
    .transform((value) => value ?? "")
    .refine((value) => value === "" || /^[+\d][\d\s-]{7,19}$/.test(value), "Check the telephone number")
    .refine((value) => value.length <= 30, "Check the telephone number"),
  subject: z.string().trim().max(160).optional(),
  message: z.string().trim().min(20, "Please write at least a sentence or two").max(4000, "Please shorten the message"),
  sourcePage: z.string().trim().max(120).optional(),
  /** Where an admission enquiry is about a particular class. Never a pupil record. */
  applyingClassId: z.string().uuid().optional(),
});

export type EnquiryInput = z.infer<typeof enquirySchema>;

export type EnquiryResult = {
  id: string;
  receivedAt: Date;
  /** Mail acknowledgement is skipped when no provider is configured. */
  acknowledgementEmailQueued: boolean;
};

export async function submitEnquiry(
  raw: unknown,
  context: { ipHash: string; userAgent: string },
): Promise<EnquiryResult> {
  const input = enquirySchema.parse(raw);
  const receivedAt = new Date();

  const row = await insertDoc("contact_enquiries", {
    kind: input.kind,
    name: input.name,
    email: input.email.toLowerCase(),
    phone: input.phone || null,
    subject: input.subject ?? null,
    message: input.message,
    sourcePage: input.sourcePage ?? null,
    submitIpHash: context.ipHash,
  });

  const id = row.id;

  await recordAudit({
    action: "contact.enquiry_received",
    resourceType: "contact_enquiry",
    resourceId: id,
    // The message text stays in the enquiry row, not in the trail.
    summary: `${input.kind} enquiry received from the website`,
    metadata: { kind: input.kind, hasPhone: Boolean(input.phone), length: input.message.length },
    ipHash: context.ipHash,
    userAgent: context.userAgent,
  });

  return { id, receivedAt: row.createdAt ?? receivedAt, acknowledgementEmailQueued: env.mailConfigured };
}
