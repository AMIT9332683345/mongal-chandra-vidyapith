import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { recordAudit } from "@/server/auth/audit";
import {
  existsDoc,
  findDoc,
  findDocs,
  findDocById,
  insertDoc,
} from "@/server/db/mongo/repository";
import { ApplicationRejectedError } from "@/server/http/errors";
import { storeFile, type StoredDocument } from "@/server/storage/files";

/**
 * Admission applications: submission and status tracking.
 *
 * A public submission creates a record that is readable only through the
 * reference number *and* the applicant's date of birth. The lookup column is a
 * hash of the pair, indexed, so the status endpoint can find the row without
 * exposing a search over names, and no route returns another family's
 * documents.
 */

const APPLICATION_DOC_TYPES = [
  "birth_certificate",
  "transfer_certificate",
  "report_card",
  "address_proof",
  "photo",
  "other",
] as const;

export const applicationSchema = z.object({
  firstName: z.string().trim().min(2, "Enter the applicant's first name").max(80),
  lastName: z.string().trim().min(1, "Enter the applicant's surname").max(80),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date format shown")
    .refine((value) => {
      const dob = new Date(`${value}T00:00:00`);
      const ageYears = (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
      return ageYears >= 2 && ageYears <= 30;
    }, "Check the date of birth"),
  gender: z.enum(["male", "female", "other"]).optional(),
  nationality: z.string().trim().max(60).optional(),
  motherTongue: z.string().trim().max(60).optional(),
  applyingClassId: z.string().uuid("Choose the class applied for"),
  previousSchoolName: z.string().trim().max(160).optional(),
  previousSchoolBoard: z.string().trim().max(120).optional(),
  previousClassCompleted: z.string().trim().max(60).optional(),
  previousSchoolYear: z.string().trim().max(20).optional(),

  guardianFirstName: z.string().trim().min(2, "Enter the guardian's first name").max(80),
  guardianLastName: z.string().trim().min(1, "Enter the guardian's surname").max(80),
  guardianRelation: z.string().trim().min(2).max(40).default("Father"),
  guardianEmail: z.string().trim().email("Enter an email address we can reply to").max(200),
  guardianPhone: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s-]{7,19}$/, "Enter a telephone number the office can reach"),
  guardianOccupation: z.string().trim().max(80).optional(),
  secondGuardianName: z.string().trim().max(160).optional(),
  secondGuardianPhone: z.string().trim().max(30).optional(),

  addressLine: z.string().trim().max(240).optional(),
  city: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().max(16).optional(),
  nearestLandmark: z.string().trim().max(160).optional(),
  siblingReference: z.string().trim().max(60).optional(),

  photoConsent: z.enum(["granted", "withdrawn", "pending", "not_required"]).default("pending"),
  /** A checkbox posts "on" when ticked and nothing at all when it is not. */
  declarationAccepted: z
    .union([z.boolean(), z.string()])
    .transform((value) => value === true || value === "true" || value === "on")
    .refine((value) => value === true, "The declaration must be accepted to submit"),
  transportRequired: z
    .union([z.boolean(), z.string()])
    .transform((value) => value === true || value === "true" || value === "on")
    .default(false),
});

export type ApplicationInput = z.infer<typeof applicationSchema>;

/** `MCV-2026-QK4XZ7` — printed on the confirmation and typed back for a status check. */
function makeReferenceNumber(academicYearName: string | null): string {
  const year = (academicYearName ?? String(new Date().getFullYear())).slice(0, 4);
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = randomBytes(6);
  let suffix = "";
  for (const byte of bytes) suffix += alphabet[byte % alphabet.length];
  return `MCV-${year}-${suffix}`;
}

/**
 * The second factor. Knowing a reference number is not enough to read a
 * decision; the lookup also needs the applicant's date of birth.
 */
export function statusLookupHash(referenceNumber: string, dateOfBirth: string): string {
  return createHash("sha256").update(`${referenceNumber.toLowerCase()}|${dateOfBirth}`).digest("hex");
}

export type SubmitResult = {
  referenceNumber: string;
  submittedAt: Date;
  applyingClassName: string | null;
  documents: StoredDocument[];
  duplicateFlags: number;
};

export type SubmitContext = {
  ipHash: string;
  userAgent: string;
  formData: FormData;
  academicYearId?: string | null;
};

const MAX_DOCUMENTS_PER_APPLICATION = 8;

async function collectDocuments(
  formData: FormData,
  applicationId: string,
): Promise<StoredDocument[]> {
  const stored: StoredDocument[] = [];
  const entries = formData.getAll("documents");
  const types = formData.getAll("documentTypes").map(String);

  for (const [index, entry] of entries.entries()) {
    if (!(entry instanceof File)) continue;
    if (entry.size === 0) continue;
    if (index >= MAX_DOCUMENTS_PER_APPLICATION) break;
    const documentType = (types[index] ?? "other") as (typeof APPLICATION_DOC_TYPES)[number];

    const document = await storeFile({
      buffer: Buffer.from(await entry.arrayBuffer()),
      originalFilename: entry.name,
      declaredMimeType: entry.type,
      kind: "admission_proof",
      title: `Admission proof — ${documentType}`,
      category: documentType,
      // Restricted: reachable only through an authorised portal download.
      visibility: "restricted",
    });
    stored.push(document);
    await insertDoc("application_documents", { applicationId, documentId: document.id, documentType });
  }
  return stored;
}

/**
 * Flags likely repeats for a person to confirm. A matching phone number is
 * often legitimate — an older sibling's application — so this records a
 * suspicion rather than rejecting anything.
 */
async function flagPossibleDuplicates(
  applicationId: string,
  input: ApplicationInput,
): Promise<number> {
  const normalizedPhone = input.guardianPhone.replace(/\D/g, "");
  const normalizedEmail = input.guardianEmail.toLowerCase();

  const matches = await findDocs(
    "admission_applications",
    { $or: [{ dateOfBirth: input.dateOfBirth }, { guardianEmail: normalizedEmail }, { guardianPhone: normalizedPhone }] },
    { sort: { submittedAt: -1 }, limit: 20 },
  );

  // The pairs already flagged, in one read instead of one existence query per match.
  const alreadyFlagged = await findDocs("application_duplicate_flags", { applicationId });
  const seen = new Set(alreadyFlagged.map((flag) => flag.duplicateOfApplicationId));

  let flagged = 0;
  for (const row of matches) {
    if (row.id === applicationId || seen.has(row.id)) continue;
    const matchedOn =
      row.dateOfBirth === input.dateOfBirth &&
      row.firstName.toLowerCase() === input.firstName.toLowerCase() &&
      row.lastName.toLowerCase() === input.lastName.toLowerCase()
        ? "same_dob_and_name"
        : row.dateOfBirth === input.dateOfBirth
          ? "same_dob"
          : row.guardianPhone === normalizedPhone
            ? "same_guardian_phone"
            : "same_guardian_email";

    await insertDoc("application_duplicate_flags", {
      applicationId,
      duplicateOfApplicationId: row.id,
      matchedOn,
    });
    seen.add(row.id);
    flagged += 1;
  }
  return flagged;
}

export async function submitApplication(
  raw: unknown,
  context: SubmitContext,
): Promise<SubmitResult> {
  const input = applicationSchema.parse(raw);

  const targetClass = await findDoc(
    "classes",
    { id: input.applyingClassId, active: true },
    { projection: { id: 1, name: 1 } },
  );
  if (!targetClass) {
    throw new ApplicationRejectedError(
      "That class is not currently open for admission.",
      "class_not_open",
      422,
    );
  }

  let yearName: string | null = null;
  let yearId: string | null = context.academicYearId ?? null;
  if (!yearId) {
    const year = await findDoc(
      "academic_years",
      { isCurrent: true },
      { projection: { id: 1, name: 1 } },
    );
    if (year) {
      yearId = year.id;
      yearName = year.name;
    }
  }

  const finalReference = makeReferenceNumber(yearName);
  const submittedAt = new Date();

  const application = await insertDoc("admission_applications", {
    referenceNumber: finalReference,
    status: "submitted",
    academicYearId: yearId,
    applyingClassId: targetClass.id,
    firstName: input.firstName,
    lastName: input.lastName,
    dateOfBirth: input.dateOfBirth,
    gender: input.gender ?? null,
    nationality: input.nationality ?? null,
    motherTongue: input.motherTongue ?? null,
    previousSchoolName: input.previousSchoolName ?? null,
    previousSchoolBoard: input.previousSchoolBoard ?? null,
    previousClassCompleted: input.previousClassCompleted ?? null,
    previousSchoolYear: input.previousSchoolYear ?? null,
    guardianFirstName: input.guardianFirstName,
    guardianLastName: input.guardianLastName,
    guardianRelation: input.guardianRelation,
    guardianEmail: input.guardianEmail.toLowerCase(),
    guardianPhone: input.guardianPhone.replace(/\D/g, ""),
    guardianOccupation: input.guardianOccupation ?? null,
    secondGuardianName: input.secondGuardianName ?? null,
    secondGuardianPhone: input.secondGuardianPhone ?? null,
    addressLine: input.addressLine ?? null,
    city: input.city ?? null,
    postalCode: input.postalCode ?? null,
    nearestLandmark: input.nearestLandmark ?? null,
    siblingReference: input.siblingReference ?? null,
    transportRequired: input.transportRequired,
    submittedAt,
    statusLookupHash: statusLookupHash(finalReference, input.dateOfBirth),
    photoConsent: input.photoConsent,
    declarationAccepted: true,
    declarationAcceptedAt: new Date(),
    submitIpHash: context.ipHash,
  });

  const id = application.id;

  await insertDoc("application_status_history", {
    applicationId: id,
    fromStatus: null,
    toStatus: "submitted",
    note: "Received through the public application form.",
  });

  const documents = await collectDocuments(context.formData, id);
  const duplicateFlags = await flagPossibleDuplicates(id, input);

  await recordAudit({
    action: "admission.application_submitted",
    resourceType: "admission_application",
    resourceId: id,
    summary: `Application ${finalReference} received for ${targetClass.name}`,
    // Never the applicant's details: the trail records that it happened.
    metadata: { classId: targetClass.id, documentCount: documents.length, duplicateFlags },
    ipHash: context.ipHash,
    userAgent: context.userAgent,
  });

  return {
    referenceNumber: finalReference,
    submittedAt,
    applyingClassName: targetClass.name,
    documents,
    duplicateFlags,
  };
}

export type PublicStatus = {
  referenceNumber: string;
  status: string;
  submittedOn: Date;
  updatedAt: Date;
  applyingClassName: string | null;
  timeline: { toStatus: string; changedAt: Date; note: string | null }[];
  documentSummary: { documentType: string; verified: boolean }[];
  interview: { scheduledAt: Date | null; venue: string | null };
  /** Shown only once a decision has been recorded. */
  decision: { label: string; notes: string | null } | null;
};

/**
 * The public status lookup. It answers with the progress of one application and
 * nothing else — no uploaded file is listed, linked or described.
 */
export async function lookupApplicationStatus(
  referenceNumber: string,
  dateOfBirth: string,
): Promise<PublicStatus | null> {
  const hash = statusLookupHash(referenceNumber.trim(), dateOfBirth.trim());
  const application = await findDoc("admission_applications", { statusLookupHash: hash });
  if (!application) return null;

  const className = application.applyingClassId
    ? (await findDocById("classes", application.applyingClassId))?.name ?? null
    : null;

  const history = await findDocs(
    "application_status_history",
    { applicationId: application.id },
    { sort: { changedAt: 1 } },
  );

  const documents = await findDocs("application_documents", { applicationId: application.id });

  const decided = ["accepted", "rejected", "withdrawn"].includes(application.status ?? "");

  return {
    referenceNumber: application.referenceNumber,
    status: application.status ?? "submitted",
    submittedOn: application.submittedAt,
    updatedAt: application.updatedAt ?? application.submittedAt,
    applyingClassName: className,
    timeline: history.map((row) => ({ toStatus: row.toStatus, changedAt: row.changedAt, note: row.note ?? null })),
    documentSummary: documents.map((row) => ({ documentType: row.documentType, verified: row.verified ?? false })),
    interview: { scheduledAt: application.interviewScheduledAt ?? null, venue: application.interviewVenue ?? null },
    decision: decided
      ? {
          label:
            application.status === "accepted"
              ? "Provisionally accepted"
              : application.status === "rejected"
                ? "Not accepted this cycle"
                : "Withdrawn",
          notes: application.decisionNotes ?? null,
        }
      : null,
  };
}
