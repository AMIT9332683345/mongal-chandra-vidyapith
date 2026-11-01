import { z } from "zod";
import {
  deleteDocs,
  findDoc,
  findDocById,
  findDocs,
  insertDoc,
  updateOneDoc,
  type DocOf,
  type FilterOf,
} from "@/server/db/mongo/repository";
import { recordAuditFor } from "@/server/auth/audit";
import { hashPassword, checkPasswordStrength } from "@/server/auth/passwords";
import { randomBytes } from "node:crypto";
import type { Principal } from "@/server/auth/session";
import { FileRejectedError, storeFile } from "@/server/storage/files";
import { ContentRejectedError } from "@/server/content/admin";

/**
 * The parts of the publishing desk that are not notices, events or albums.
 *
 * Downloads, testimonials, questions, editable pages and awards all share one
 * shape: a row the school writes, a publish step, and a public reader that only
 * sees the published state. Keeping them here means the same auditing and the
 * same refusal rules apply, rather than each panel page inventing its own.
 */

const STATUSES = ["draft", "published", "unpublished", "archived"] as const;

function now(): Date {
  return new Date();
}

function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/* -------------------------------------------------------------------------- */
/* Documents and downloads                                                     */
/* -------------------------------------------------------------------------- */

export type DocumentAdminRow = {
  id: string;
  title: string | null;
  description: string | null;
  originalFilename: string;
  mimeType: string;
  kind: string;
  category: string | null;
  sizeBytes: number;
  visibility: "public" | "restricted" | "private";
  status: string;
  createdAt: Date;
};

export async function listDocumentsForAdmin(): Promise<DocumentAdminRow[]> {
  const rows = await findDocs("documents", { deletedAt: null }, { sort: { createdAt: -1 }, limit: 200 });
  return rows.map((row) => ({
    id: row.id,
    title: row.title ?? null,
    description: row.description ?? null,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    kind: row.kind,
    category: row.category ?? null,
    sizeBytes: row.sizeBytes,
    visibility: row.visibility,
    status: row.status,
    createdAt: row.createdAt,
  }));
}

export const downloadUploadSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(600).nullable().optional(),
  category: z.string().trim().max(40).nullable().optional(),
  visibility: z.enum(["public", "restricted"]),
});

export async function uploadDownloads(
  actor: Principal,
  files: File[],
  input: z.input<typeof downloadUploadSchema>,
): Promise<{ added: number; rejected: string[] }> {
  const parsed = downloadUploadSchema.parse(input);
  if (files.length === 0) throw new ContentRejectedError("Choose at least one file to upload.");
  if (files.length > 10) throw new ContentRejectedError("Upload at most ten files at once.");

  const rejected: string[] = [];
  let added = 0;
  for (const file of files) {
    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
    } catch {
      rejected.push(file.name);
      continue;
    }
    try {
      const stored = await storeFile({
        buffer,
        originalFilename: file.name,
        declaredMimeType: file.type || "",
        kind: "download",
        title: parsed.title,
        category: parsed.category ?? "general",
        visibility: parsed.visibility,
        uploadedBy: actor.userId,
      });
      await updateOneDoc("documents", { id: stored.id }, {
        description: parsed.description ?? null,
        status: "published",
        updatedAt: now(),
      });
      added += 1;
    } catch (error) {
      if (error instanceof FileRejectedError) {
        rejected.push(`${file.name}: ${error.message}`);
        continue;
      }
      throw error;
    }
  }

  await recordAuditFor(actor, {
    action: "document.upload",
    resourceType: "document",
    summary: `Uploaded ${added} download${added === 1 ? "" : "s"} as “${parsed.title}”`,
    metadata: { rejected: rejected.length, visibility: parsed.visibility },
  });
  return { added, rejected };
}

export async function setDocumentVisibility(
  actor: Principal,
  id: string,
  visibility: "public" | "restricted",
): Promise<void> {
  const row = await findDocById("documents", id);
  if (!row) throw new ContentRejectedError("That file no longer exists.");
  await updateOneDoc("documents", { id }, { visibility, updatedAt: now() });
  await recordAuditFor(actor, {
    action: "document.upload",
    resourceType: "document",
    resourceId: id,
    summary: `Marked “${row.title ?? row.originalFilename}” ${visibility === "public" ? "public" : "restricted"}`,
  });
}

export async function deleteDocument(actor: Principal, id: string): Promise<void> {
  const row = await findDocById("documents", id);
  if (!row) throw new ContentRejectedError("That file no longer exists.");
  // The row is retired, not erased: a notice may still cite it in its history.
  await updateOneDoc("documents", { id }, {
    deletedAt: now(),
    visibility: "private",
    status: "archived",
    updatedAt: now(),
  });
  await recordAuditFor(actor, {
    action: "document.delete",
    resourceType: "document",
    resourceId: id,
    summary: `Retired “${row.title ?? row.originalFilename}”`,
  });
}

/* -------------------------------------------------------------------------- */
/* Testimonials                                                                */
/* -------------------------------------------------------------------------- */

export const testimonialSchema = z.object({
  id: z.string().uuid().optional(),
  quote: z.string().trim().min(20, "A testimonial needs at least a sentence.").max(1200),
  authorName: z.string().trim().min(2).max(120),
  authorRole: z.enum(["parent", "alumnus", "student", "teacher", "wellwisher"]),
  authorDetail: z.string().trim().max(160).nullable().optional(),
  consentRecorded: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export async function listTestimonialsForAdmin() {
  const rows = await findDocs("testimonials", {}, { sort: { sortOrder: 1, createdAt: -1 } });
  return rows.map((row) => ({
    id: row.id,
    quote: row.quote,
    authorName: row.authorName,
    authorRole: row.authorRole,
    authorDetail: row.authorDetail ?? null,
    consentRecorded: row.consentRecorded,
    status: row.status,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt,
  }));
}

export async function getTestimonialForAdmin(id: string) {
  return findDocById("testimonials", id);
}

export async function saveTestimonial(actor: Principal, input: z.input<typeof testimonialSchema>) {
  const parsed = testimonialSchema.parse(input);
  const values = {
    quote: parsed.quote,
    authorName: parsed.authorName,
    authorRole: parsed.authorRole,
    authorDetail: parsed.authorDetail ?? null,
    consentRecorded: parsed.consentRecorded,
    sortOrder: parsed.sortOrder ?? 100,
    updatedAt: now(),
  };
  const id = parsed.id
    ? (await updateOneDoc("testimonials", { id: parsed.id }, values), parsed.id)
    : (await insertDoc("testimonials", { ...values, status: "draft" })).id;

  await recordAuditFor(actor, {
    action: parsed.id ? "homepage.edit" : "homepage.edit",
    resourceType: "testimonial",
    resourceId: id,
    summary: `${parsed.id ? "Updated" : "Drafted"} a testimonial from ${parsed.authorName}`,
  });
  return { id };
}

export async function setTestimonialStatus(
  actor: Principal,
  id: string,
  action: "publish" | "unpublish" | "archive",
): Promise<void> {
  const row = await findDocById("testimonials", id);
  if (!row) throw new ContentRejectedError("That testimonial no longer exists.");
  if (action === "publish" && !row.consentRecorded) {
    throw new ContentRejectedError(
      "The named person has not consented to being quoted, so this testimonial cannot be published.",
    );
  }
  const status = action === "publish" ? "published" : action === "unpublish" ? "unpublished" : "archived";
  await updateOneDoc("testimonials", { id }, {
    status,
    publishedAt: action === "publish" ? (row.publishedAt ?? now()) : row.publishedAt ?? null,
    updatedAt: now(),
  });
  await recordAuditFor(actor, {
    action: "homepage.publish",
    resourceType: "testimonial",
    resourceId: id,
    summary: `${action === "publish" ? "Published" : action === "unpublish" ? "Took down" : "Archived"} the testimonial from ${row.authorName}`,
  });
}

export async function deleteTestimonial(actor: Principal, id: string): Promise<void> {
  const row = await findDocById("testimonials", id);
  if (!row) throw new ContentRejectedError("That testimonial no longer exists.");
  await deleteDocs("testimonials", { id });
  await recordAuditFor(actor, {
    action: "homepage.publish",
    resourceType: "testimonial",
    resourceId: id,
    summary: `Deleted the testimonial from ${row.authorName}`,
  });
}

/* -------------------------------------------------------------------------- */
/* Questions                                                                   */
/* -------------------------------------------------------------------------- */

export const faqSchema = z.object({
  id: z.string().uuid().optional(),
  question: z.string().trim().min(5).max(240),
  answer: z.string().trim().min(5).max(2400),
  category: z.string().trim().max(40).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export async function listFaqsForAdmin() {
  const rows = await findDocs("faqs", {}, { sort: { sortOrder: 1, createdAt: -1 } });
  return rows.map((row) => ({
    id: row.id,
    question: row.question,
    answer: row.answer,
    category: row.category,
    published: row.published,
    sortOrder: row.sortOrder,
  }));
}

export async function saveFaq(actor: Principal, input: z.input<typeof faqSchema>) {
  const parsed = faqSchema.parse(input);
  const values = {
    question: parsed.question,
    answer: parsed.answer,
    category: parsed.category ?? "general",
    sortOrder: parsed.sortOrder ?? 100,
    updatedAt: now(),
  };
  const id = parsed.id
    ? (await updateOneDoc("faqs", { id: parsed.id }, values), parsed.id)
    : (await insertDoc("faqs", { ...values, published: false })).id;
  await recordAuditFor(actor, {
    action: "faq.edit",
    resourceType: "faq",
    resourceId: id,
    summary: `${parsed.id ? "Updated" : "Drafted"} the question “${parsed.question}”`,
  });
  return { id };
}

export async function setFaqPublished(actor: Principal, id: string, published: boolean): Promise<void> {
  const row = await findDocById("faqs", id);
  if (!row) throw new ContentRejectedError("That question no longer exists.");
  await updateOneDoc("faqs", { id }, { published, updatedAt: now() });
  await recordAuditFor(actor, {
    action: "faq.edit",
    resourceType: "faq",
    resourceId: id,
    summary: `${published ? "Published" : "Unpublished"} “${row.question}”`,
  });
}

export async function deleteFaq(actor: Principal, id: string): Promise<void> {
  const row = await findDocById("faqs", id);
  if (!row) throw new ContentRejectedError("That question no longer exists.");
  await deleteDocs("faqs", { id });
  await recordAuditFor(actor, {
    action: "faq.edit",
    resourceType: "faq",
    resourceId: id,
    summary: `Deleted “${row.question}”`,
  });
}

/* -------------------------------------------------------------------------- */
/* Editable pages                                                              */
/* -------------------------------------------------------------------------- */

export const contentPageSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().trim().max(80).optional(),
  title: z.string().trim().min(2).max(200),
  intro: z.string().trim().max(600).nullable().optional(),
  body: z.string().trim().max(20000).nullable().optional(),
  seoTitle: z.string().trim().max(120).nullable().optional(),
  seoDescription: z.string().trim().max(300).nullable().optional(),
  noIndex: z.boolean().optional(),
});

export async function listContentPagesForAdmin() {
  const rows = await findDocs("content_pages", {}, { sort: { sortOrder: 1, slug: 1 } });
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    intro: row.intro ?? null,
    body: row.body ?? null,
    seoTitle: row.seoTitle ?? null,
    seoDescription: row.seoDescription ?? null,
    status: row.status,
    noIndex: row.noIndex,
    updatedAt: row.updatedAt,
  }));
}

export async function getContentPageForAdmin(id: string) {
  return findDocById("content_pages", id);
}

export async function saveContentPage(actor: Principal, input: z.input<typeof contentPageSchema>) {
  const parsed = contentPageSchema.parse(input);
  const slug = slugify(parsed.slug || parsed.title);
  if (!slug) throw new ContentRejectedError("A page needs a title that can become a web address.");

  const clash = await findDoc("content_pages", { slug });
  if (clash && clash.id !== parsed.id) {
    throw new ContentRejectedError(`Another page already uses the address “${slug}”.`);
  }

  const values = {
    slug,
    title: parsed.title,
    intro: parsed.intro ?? null,
    body: parsed.body ?? null,
    seoTitle: parsed.seoTitle ?? null,
    seoDescription: parsed.seoDescription ?? null,
    noIndex: parsed.noIndex ?? false,
    updatedByUserId: actor.userId,
    updatedAt: now(),
  };
  const id = parsed.id
    ? (await updateOneDoc("content_pages", { id: parsed.id }, values), parsed.id)
    : (await insertDoc("content_pages", { ...values, status: "draft" })).id;
  await recordAuditFor(actor, {
    action: parsed.id ? "page.edit" : "page.create",
    resourceType: "content_page",
    resourceId: id,
    summary: `${parsed.id ? "Updated" : "Created"} the page “${parsed.title}”`,
  });
  return { id, slug };
}

export async function setContentPageStatus(
  actor: Principal,
  id: string,
  action: "publish" | "unpublish" | "archive",
): Promise<void> {
  const row = await findDocById("content_pages", id);
  if (!row) throw new ContentRejectedError("That page no longer exists.");
  const status = action === "publish" ? "published" : action === "unpublish" ? "unpublished" : "archived";
  await updateOneDoc("content_pages", { id }, {
    status,
    publishedAt: action === "publish" ? (row.publishedAt ?? now()) : row.publishedAt ?? null,
    updatedAt: now(),
  });
  await recordAuditFor(actor, {
    action: "page.publish",
    resourceType: "content_page",
    resourceId: id,
    summary: `${action === "publish" ? "Published" : action === "unpublish" ? "Unpublished" : "Archived"} “${row.title}”`,
  });
}

export async function deleteContentPage(actor: Principal, id: string): Promise<void> {
  const row = await findDocById("content_pages", id);
  if (!row) throw new ContentRejectedError("That page no longer exists.");
  await updateOneDoc("content_pages", { id }, { status: "archived", updatedAt: now() });
  await recordAuditFor(actor, {
    action: "page.publish",
    resourceType: "content_page",
    resourceId: id,
    summary: `Archived “${row.title}”`,
  });
}

/* -------------------------------------------------------------------------- */
/* Achievements                                                                */
/* -------------------------------------------------------------------------- */

export const achievementSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(800).nullable().optional(),
  category: z.string().trim().min(2).max(40).optional(),
  achievedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in the form YYYY-MM-DD.")
    .nullable()
    .optional(),
  eventName: z.string().trim().max(160).nullable().optional(),
  awardingBody: z.string().trim().max(160).nullable().optional(),
  confirmed: z.boolean(),
});

export async function listAchievementsForAdmin() {
  const rows = await findDocs("achievements", {}, { sort: { achievedOn: -1, createdAt: -1 } });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    category: row.category,
    achievedOn: row.achievedOn ?? null,
    eventName: row.eventName ?? null,
    awardingBody: row.awardingBody ?? null,
    confirmed: row.confirmed,
    status: row.status,
  }));
}

export async function saveAchievement(actor: Principal, input: z.input<typeof achievementSchema>) {
  const parsed = achievementSchema.parse(input);
  const values = {
    title: parsed.title,
    description: parsed.description ?? null,
    category: parsed.category ?? "academic",
    achievedOn: parsed.achievedOn ?? null,
    eventName: parsed.eventName ?? null,
    awardingBody: parsed.awardingBody ?? null,
    confirmed: parsed.confirmed,
    updatedAt: now(),
  };
  const id = parsed.id
    ? (await updateOneDoc("achievements", { id: parsed.id }, values), parsed.id)
    : (await insertDoc("achievements", { ...values, status: "draft" })).id;
  await recordAuditFor(actor, {
    action: "achievement.edit",
    resourceType: "achievement",
    resourceId: id,
    summary: `${parsed.id ? "Updated" : "Recorded"} “${parsed.title}”`,
  });
  return { id };
}

export async function setAchievementStatus(
  actor: Principal,
  id: string,
  action: "publish" | "unpublish",
): Promise<void> {
  const row = await findDocById("achievements", id);
  if (!row) throw new ContentRejectedError("That achievement no longer exists.");
  if (action === "publish" && !row.confirmed) {
    throw new ContentRejectedError(
      "This result has not been confirmed against a verified record, so it cannot be published.",
    );
  }
  await updateOneDoc("achievements", { id }, {
    status: action === "publish" ? "published" : "unpublished",
    publishedAt: action === "publish" ? (row.publishedAt ?? now()) : row.publishedAt ?? null,
    updatedAt: now(),
  });
  await recordAuditFor(actor, {
    action: "achievement.edit",
    resourceType: "achievement",
    resourceId: id,
    summary: `${action === "publish" ? "Published" : "Unpublished"} “${row.title}”`,
  });
}

export async function deleteAchievement(actor: Principal, id: string): Promise<void> {
  const row = await findDocById("achievements", id);
  if (!row) throw new ContentRejectedError("That achievement no longer exists.");
  await deleteDocs("achievements", { id });
  await recordAuditFor(actor, {
    action: "achievement.edit",
    resourceType: "achievement",
    resourceId: id,
    summary: `Deleted “${row.title}”`,
  });
}

/* -------------------------------------------------------------------------- */
/* Admission applications and enquiries                                        */
/* -------------------------------------------------------------------------- */

export const APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "documents_required",
  "interview_scheduled",
  "accepted",
  "rejected",
  "withdrawn",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export async function listApplicationsForAdmin(filter: { status?: ApplicationStatus } = {}) {
  const where: FilterOf<DocOf<"admission_applications">> = {};
  if (filter.status) where.status = filter.status;
  const rows = await findDocs("admission_applications", where, { sort: { submittedAt: -1 }, limit: 200 });
  return rows.map((row) => ({
    id: row.id,
    referenceNumber: row.referenceNumber,
    status: row.status,
    firstName: row.firstName,
    lastName: row.lastName,
    dateOfBirth: row.dateOfBirth,
    guardianFirstName: row.guardianFirstName,
    guardianLastName: row.guardianLastName,
    guardianEmail: row.guardianEmail,
    guardianPhone: row.guardianPhone,
    submittedAt: row.submittedAt,
    flaggedAsSpam: row.flaggedAsSpam,
    decidedAt: row.decidedAt ?? null,
    decisionNotes: row.decisionNotes ?? null,
  }));
}

export async function getApplicationForAdmin(id: string) {
  return findDocById("admission_applications", id);
}

/**
 * One application as the admissions desk reads it: the form, the class applied
 * for, the files the family attached, and every change of state with the note
 * that came with it. Nothing here is public; the caller has already proved it
 * holds `admission.view`.
 */
export async function getApplicationDetailForAdmin(id: string) {
  const application = await findDocById("admission_applications", id);
  if (!application) return null;

  const [className, attachments, history] = await Promise.all([
    application.applyingClassId
      ? findDocById("classes", application.applyingClassId).then((row) => row?.name ?? null)
      : Promise.resolve(null),
    findDocs("application_documents", { applicationId: id }, { sort: { uploadedAt: 1 } }),
    findDocs("application_status_history", { applicationId: id }, { sort: { changedAt: 1 } }),
  ]);

  const files = await Promise.all(
    attachments.map(async (attachment) => {
      const document = await findDocById("documents", attachment.documentId);
      return {
        documentId: attachment.documentId,
        documentType: attachment.documentType,
        verified: attachment.verified ?? false,
        filename: document?.originalFilename ?? null,
        mimeType: document?.mimeType ?? null,
        sizeBytes: document?.sizeBytes ?? null,
        available: !!document && !document.deletedAt,
      };
    }),
  );

  return {
    application,
    className,
    files,
    history: history.map((row) => ({
      fromStatus: row.fromStatus ?? null,
      toStatus: row.toStatus,
      note: row.note ?? null,
      changedAt: row.changedAt,
    })),
  };
}

export async function setApplicationStatus(
  actor: Principal,
  id: string,
  status: ApplicationStatus,
  notes: string | null,
): Promise<void> {
  const row = await findDocById("admission_applications", id);
  if (!row) throw new ContentRejectedError("That application no longer exists.");
  const decided = status === "accepted" || status === "rejected";
  await updateOneDoc("admission_applications", { id }, {
    status,
    decisionNotes: notes ?? row.decisionNotes ?? null,
    decidedByUserId: decided ? actor.userId : row.decidedByUserId ?? null,
    decidedAt: decided ? now() : row.decidedAt ?? null,
    updatedAt: now(),
  });
  await recordAuditFor(actor, {
    action: "admission.review",
    resourceType: "admission_application",
    resourceId: id,
    summary: `Moved application ${row.referenceNumber} to ${status}`,
  });
}

export async function listEnquiriesForAdmin(filter: { status?: string } = {}) {
  const where: FilterOf<DocOf<"contact_enquiries">> = {};
  if (filter.status) where.status = filter.status as DocOf<"contact_enquiries">["status"];
  const rows = await findDocs("contact_enquiries", where, { sort: { createdAt: -1 }, limit: 200 });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    email: row.email,
    phone: row.phone ?? null,
    subject: row.subject ?? null,
    message: row.message,
    status: row.status,
    flaggedAsSpam: row.flaggedAsSpam,
    responseText: row.responseText ?? null,
    createdAt: row.createdAt,
  }));
}

export async function setEnquiryStatus(
  actor: Principal,
  id: string,
  status: DocOf<"contact_enquiries">["status"],
  responseText: string | null,
): Promise<void> {
  const row = await findDocById("contact_enquiries", id);
  if (!row) throw new ContentRejectedError("That enquiry no longer exists.");
  const responded = status === "completed" || status === "rejected";
  await updateOneDoc("contact_enquiries", { id }, {
    status,
    responseText: responseText ?? row.responseText ?? null,
    respondedByUserId: responded ? actor.userId : row.respondedByUserId ?? null,
    respondedAt: responded ? now() : row.respondedAt ?? null,
    updatedAt: now(),
  });
  await recordAuditFor(actor, {
    action: "enquiry.manage",
    resourceType: "contact_enquiry",
    resourceId: id,
    summary: `Moved enquiry from ${row.name} to ${status}`,
  });
}

/* -------------------------------------------------------------------------- */
/* Accounts and roles                                                          */
/* -------------------------------------------------------------------------- */

export async function listUsersForAdmin() {
  const [users, roles, grants] = await Promise.all([
    findDocs("users", { status: { $ne: "deleted" } }, { sort: { createdAt: -1 }, limit: 300 }),
    findDocs("roles", {}, { sort: { sortOrder: 1 } }),
    findDocs("user_roles", { active: true }),
  ]);
  const roleById = new Map(roles.map((role) => [role.id, role]));
  return users.map((user) => ({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt,
    roles: grants
      .filter((grant) => grant.userId === user.id)
      .map((grant) => roleById.get(grant.roleId)?.name ?? "Unknown role"),
    roleIds: grants.filter((grant) => grant.userId === user.id).map((grant) => grant.roleId),
  }));
}

export async function listRolesForAdmin() {
  return findDocs("roles", {}, { sort: { sortOrder: 1 } });
}

function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(20);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return `${out}${randomBytes(1)[0] % 10}`;
}

export async function createPanelUser(
  actor: Principal,
  input: { email: string; displayName: string; roleId: string },
): Promise<{ id: string; password: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ContentRejectedError("That email address is not valid.");
  }
  const existing = await findDoc("users", { email });
  if (existing) throw new ContentRejectedError("An account with that email already exists.");
  const role = await findDocById("roles", input.roleId);
  if (!role) throw new ContentRejectedError("Choose a role for this account.");

  const password = generatePassword();
  const strength = checkPasswordStrength(password);
  if (!strength.ok) throw new ContentRejectedError(strength.problems.join(" "));

  const user = await insertDoc("users", {
    email,
    displayName: input.displayName.trim(),
    passwordHash: await hashPassword(password),
    status: "active",
    mustChangePassword: true,
    createdBy: actor.userId,
  });
  await insertDoc("user_roles", {
    userId: user.id,
    roleId: role.id,
    classId: null,
    academicYearId: null,
    grantedBy: actor.userId,
    grantedAt: now(),
    active: true,
  });
  await recordAuditFor(actor, {
    action: "user.create",
    resourceType: "user",
    resourceId: user.id,
    summary: `Created ${email} with the role ${role.name}`,
  });
  return { id: user.id, password };
}

export async function assignUserRole(actor: Principal, userId: string, roleId: string): Promise<void> {
  const [user, role] = await Promise.all([findDocById("users", userId), findDocById("roles", roleId)]);
  if (!user) throw new ContentRejectedError("That account no longer exists.");
  if (!role) throw new ContentRejectedError("That role no longer exists.");
  await deleteDocs("user_roles", { userId });
  await insertDoc("user_roles", {
    userId,
    roleId,
    classId: null,
    academicYearId: null,
    grantedBy: actor.userId,
    grantedAt: now(),
    active: true,
  });
  await recordAuditFor(actor, {
    action: "role.assign",
    resourceType: "user",
    resourceId: userId,
    summary: `Gave ${user.email} the role ${role.name}`,
  });
}

export async function setUserActive(actor: Principal, userId: string, active: boolean): Promise<void> {
  const user = await findDocById("users", userId);
  if (!user) throw new ContentRejectedError("That account no longer exists.");
  if (user.id === actor.userId && !active) {
    throw new ContentRejectedError("You cannot suspend the account you are signed in with.");
  }
  await updateOneDoc("users", { id: userId }, {
    status: active ? "active" : "suspended",
    updatedAt: now(),
  });
  if (!active) await deleteDocs("sessions", { userId });
  await recordAuditFor(actor, {
    action: "user.deactivate",
    resourceType: "user",
    resourceId: userId,
    summary: `${active ? "Reactivated" : "Suspended"} ${user.email}`,
  });
}
