import { z } from "zod";
import {
  deleteDocs,
  findDoc,
  findDocById,
  findDocs,
  insertDoc,
  replaceDoc,
  updateOneDoc,
  upsertDoc,
  type DocOf,
  type FilterOf,
} from "@/server/db/mongo/repository";
import { recordAuditFor } from "@/server/auth/audit";
import type { Principal } from "@/server/auth/session";
import { FileRejectedError, storeFile } from "@/server/storage/files";

/**
 * The writing half of the content system.
 *
 * Everything the public site reads is produced here, by a named actor, through
 * one of these functions. Nothing in this module trusts a caller to have asked
 * permission first — the routes in `actions.ts` do that — but each write records
 * who made it, and the publish paths refuse to publish something that would put
 * an unverified photograph of a child on the internet.
 */

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                              */
/* -------------------------------------------------------------------------- */

export class ContentRejectedError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = "ContentRejectedError";
  }
}

/** URL-safe, ASCII-only, and never empty. */
export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "item";
}

async function uniqueSlug(
  collection: "notices" | "events" | "gallery_albums",
  title: string,
  keepId?: string,
): Promise<string> {
  const base = slugify(title);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const where = { slug: candidate } as FilterOf<DocOf<typeof collection>>;
    const clash = await findDoc(collection, where, { projection: { id: 1 } });
    if (!clash || clash.id === keepId) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * An empty box means "no value", not "keep what was there".
 *
 * A browser sends an untouched field as the empty string, and a field the panel
 * never rendered as nothing at all. Both are the same answer from a form, so both
 * become null before the length and format checks run — which is also what lets a
 * school clear a value it had already typed in.
 */
function blankToNull(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
}

/** `YYYY-MM-DD` or null; anything else is rejected rather than guessed at. */
const dateField = z.preprocess(
  blankToNull,
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date format YYYY-MM-DD.")
    .nullable(),
);

const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max, `Keep this to ${max} characters or fewer.`).nullable());

function asDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function todayIso(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/* -------------------------------------------------------------------------- */
/* School settings                                                             */
/* -------------------------------------------------------------------------- */

export const settingsDraftSchema = z.object({
  /** Setting key → the text typed into its field. */
  values: z.record(z.string(), z.string()),
  /** Keys the office has signed off as correct for public use. */
  confirmed: z.array(z.string()),
});

/**
 * Saves the answers and, separately, whether each has been confirmed.
 *
 * The two are deliberately distinct: an unconfirmed value stays out of the
 * public site even though it is stored, because "the office typed something in"
 * and "the school publishes this" are different claims.
 */
export async function saveSettings(
  actor: Principal,
  input: z.input<typeof settingsDraftSchema>,
): Promise<{ changed: number }> {
  const parsed = settingsDraftSchema.parse(input);
  const rows = await findDocs("school_settings", {}, { sort: { group: 1, sortOrder: 1 } });
  const byKey = new Map(rows.map((row) => [row.key, row]));
  let changed = 0;

  for (const [key, raw] of Object.entries(parsed.values)) {
    const row = byKey.get(key);
    if (!row) continue;
    const value = raw.trim() === "" ? null : coerce(row.inputKind, raw.trim());
    const isConfirmed = parsed.confirmed.includes(key);
    if (sameValue(row.value, value) && row.isConfirmed === isConfirmed) continue;

    await updateOneDoc("school_settings", { id: row.id }, { value, isConfirmed, updatedByUserId: actor.userId });
    changed += 1;
  }

  await recordAuditFor(actor, {
    action: "school_setting.edit",
    resourceType: "school_setting",
    summary: `Updated ${changed} school setting${changed === 1 ? "" : "s"}`,
    metadata: { keys: Object.keys(parsed.values).slice(0, 60) },
  });
  return { changed };
}

/** A number field keeps a number, a date field a `YYYY-MM-DD` string. */
function coerce(inputKind: string, text: string): string | number | boolean {
  if (inputKind === "number") {
    const asNumber = Number(text);
    return Number.isFinite(asNumber) ? asNumber : text;
  }
  if (inputKind === "checkbox") return text !== "false";
  return text;
}

export type SettingAdminRow = {
  id: string;
  key: string;
  group: string;
  label: string;
  description: string | null;
  placeholderNote: string | null;
  inputKind: string;
  sortOrder: number;
  publicReadable: boolean;
  /** Empty string when the office has typed nothing yet, so a form field can bind to it. */
  value: string;
  confirmed: boolean;
};

/**
 * Every setting row, confirmed or not — this is the editor's view.
 *
 * The public site reads a narrow subset; the panel has to show the whole list,
 * because the row a school still needs to fill in is precisely the one the
 * public pages are silent about.
 */
export async function listSettingsForAdmin(): Promise<SettingAdminRow[]> {
  const rows = await findDocs("school_settings", {}, { sort: { group: 1, sortOrder: 1 } });
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    group: row.group,
    label: row.label,
    description: row.description ?? null,
    placeholderNote: row.placeholderNote ?? null,
    inputKind: row.inputKind,
    sortOrder: row.sortOrder ?? 0,
    publicReadable: row.publicReadable ?? false,
    value: row.value === null || row.value === undefined ? "" : String(row.value),
    confirmed: row.isConfirmed ?? false,
  }));
}

function sameValue(stored: unknown, next: unknown): boolean {
  if (stored === next) return true;
  if (stored === null || stored === undefined) return next === null;
  return String(stored) === String(next);
}

/* -------------------------------------------------------------------------- */
/* Homepage sections                                                           */
/* -------------------------------------------------------------------------- */

export const homepageSectionSchema = z.object({
  sectionKey: z.string().min(2).max(60),
  heading: optionalText(160),
  subheading: optionalText(240),
  body: optionalText(8000),
  ctaLabel: optionalText(60),
  ctaHref: optionalText(300),
});

export async function listHomepageSectionsForAdmin() {
  const rows = await findDocs("homepage_sections", {}, { sort: { sortOrder: 1 } });
  return rows.map((row) => ({
    id: row.id,
    sectionKey: row.sectionKey,
    heading: row.heading ?? "",
    subheading: row.subheading ?? "",
    body: row.body ?? "",
    ctaLabel: row.ctaLabel ?? "",
    ctaHref: row.ctaHref ?? "",
    visible: row.visible ?? false,
    sortOrder: row.sortOrder ?? 0,
    authoringNote:
      (row.metadata as { authoringNote?: string } | null)?.authoringNote ?? null,
    updatedAt: row.updatedAt,
  }));
}

export async function saveHomepageSection(actor: Principal, input: z.input<typeof homepageSectionSchema>) {
  const parsed = homepageSectionSchema.parse(input);
  const existing = await findDoc("homepage_sections", { sectionKey: parsed.sectionKey });
  if (!existing) throw new ContentRejectedError("That homepage block no longer exists.");

  await replaceDoc(
    "homepage_sections",
    { id: existing.id },
    {
      heading: parsed.heading,
      subheading: parsed.subheading,
      body: parsed.body,
      ctaLabel: parsed.ctaLabel,
      ctaHref: safeRelativeHref(parsed.ctaHref),
      updatedByUserId: actor.userId,
    },
  );

  await recordAuditFor(actor, {
    action: "homepage.edit",
    resourceType: "homepage_section",
    resourceId: existing.id,
    summary: `Saved the “${parsed.heading || parsed.sectionKey}” block`,
  });
  return { id: existing.id };
}

/**
 * Shows or hides a block on the public homepage.
 *
 * This is deliberately not part of the words form. A block that is already live
 * has to stay live while an editor without publishing rights corrects a sentence
 * in it — and if visibility travelled with the words, saving that correction would
 * either hide the block by accident or need a permission the editor does not hold.
 */
export async function setHomepageSectionVisibility(
  actor: Principal,
  sectionKey: string,
  visible: boolean,
): Promise<{ sectionKey: string; visible: boolean }> {
  const existing = await findDoc("homepage_sections", { sectionKey });
  if (!existing) throw new ContentRejectedError("That homepage block no longer exists.");
  if (visible && !hasWords(existing)) {
    throw new ContentRejectedError("An empty block cannot be shown — give it a heading and some words first.");
  }

  await replaceDoc("homepage_sections", { id: existing.id }, { visible, updatedByUserId: actor.userId });
  await recordAuditFor(actor, {
    action: visible ? "homepage.publish" : "homepage.edit",
    resourceType: "homepage_section",
    resourceId: existing.id,
    summary: `${visible ? "Showed" : "Hid"} the “${existing.heading || sectionKey}” block`,
  });
  return { sectionKey, visible };
}

/** A block the panel can put in front of families: something to read, and words that are not just whitespace. */
function hasWords(section: { heading?: string | null; body?: string | null }): boolean {
  const heading = section.heading?.trim() ?? "";
  const body = section.body?.trim() ?? "";
  return heading.length > 0 || body.length > 0;
}

/** A call-to-action may point inside this site, or at an absolute https address. */
function safeRelativeHref(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("/")) return value.slice(0, 300);
  if (/^https:\/\//i.test(value)) return value.slice(0, 300);
  throw new ContentRejectedError(
    `“${value.slice(0, 60)}” is not an address a button may point at. Use a path on this site starting with /, or a full https:// address.`,
  );
}

/* -------------------------------------------------------------------------- */
/* Notices                                                                     */
/* -------------------------------------------------------------------------- */

export const noticeSchema = z.object({
  id: optionalText(60),
  title: z.string().trim().min(4, "Give the notice a title.").max(200),
  summary: optionalText(600),
  body: z.string().trim().min(1, "The notice has no text.").max(40000),
  categoryKey: optionalText(60),
  referenceNumber: optionalText(60),
  issuedOn: dateField,
  expiresOn: dateField,
  pinned: z.boolean(),
  pinUntil: dateField,
});

export type NoticeAdminRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body: string;
  categoryName: string | null;
  categoryKey: string | null;
  status: NoticesDoc["status"];
  publicVisible: boolean;
  pinned: boolean;
  pinUntil: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  publishAt: Date | null;
  publishedAt: Date | null;
  updatedAt: Date;
};

type NoticesDoc = DocOf<"notices">;

export async function listNoticesForAdmin(filter: { status?: string } = {}): Promise<NoticeAdminRow[]> {
  const where: FilterOf<NoticesDoc> = {};
  if (filter.status) where.status = filter.status as NoticesDoc["status"];
  const rows = await findDocs("notices", where, { sort: { updatedAt: -1 }, limit: 200 });
  const categories = await findDocs("notice_categories", {});
  const byId = new Map(categories.map((category) => [category.id, category]));
  return rows.map((row) => {
    const category = row.categoryId ? byId.get(row.categoryId) : undefined;
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary ?? null,
      body: row.body,
      categoryName: category?.name ?? null,
      categoryKey: category?.key ?? null,
      status: row.status,
      publicVisible: row.publicVisible ?? false,
      pinned: row.pinned ?? false,
      pinUntil: row.pinUntil ?? null,
      issuedOn: row.issuedOn ?? null,
      expiresOn: row.expiresOn ?? null,
      publishAt: row.publishAt ?? null,
      publishedAt: row.publishedAt ?? null,
      updatedAt: row.updatedAt,
    };
  });
}

export async function getNoticeForAdmin(id: string): Promise<NoticeAdminRow | null> {
  const rows = await listNoticesForAdmin();
  return rows.find((row) => row.id === id) ?? null;
}

/**
 * Creates or updates a notice. The status never changes here: saving a draft and
 * putting something on the public board are two different permissions, and a
 * form that could do both by accident is how a school publishes an unfinished
 * notice.
 */
export async function saveNotice(actor: Principal, input: z.input<typeof noticeSchema>) {
  const parsed = noticeSchema.parse(input);

  if (parsed.expiresOn && parsed.issuedOn && parsed.expiresOn < parsed.issuedOn) {
    throw new ContentRejectedError("The notice stops displaying before it is issued.");
  }

  const category = parsed.categoryKey
    ? await findDoc("notice_categories", { key: parsed.categoryKey })
    : null;
  if (parsed.categoryKey && !category) {
    throw new ContentRejectedError("That notice category does not exist.");
  }

  const existing = parsed.id ? await findDocById("notices", parsed.id) : null;
  if (parsed.id && !existing) throw new ContentRejectedError("That notice no longer exists.");

  const slug = await uniqueSlug("notices", parsed.title, existing?.id);
  const values = {
    title: parsed.title,
    slug,
    summary: parsed.summary,
    body: parsed.body,
    categoryId: category?.id ?? null,
    referenceNumber: parsed.referenceNumber,
    issuedOn: parsed.issuedOn ?? existing?.issuedOn ?? todayIso(),
    expiresOn: parsed.expiresOn,
    pinned: parsed.pinned,
    pinUntil: parsed.pinned ? parsed.pinUntil : null,
    updatedByUserId: actor.userId,
  };

  if (existing) {
    await replaceDoc("notices", { id: existing.id }, values);
    await recordAuditFor(actor, {
      action: "notice.edit",
      resourceType: "notice",
      resourceId: existing.id,
      summary: `Edited “${parsed.title}”`,
    });
    return { id: existing.id, slug };
  }

  const created = await insertDoc("notices", {
    ...values,
    status: "draft",
    publicVisible: false,
    approvalStatus: "not_required",
    createdByUserId: actor.userId,
  });
  await recordAuditFor(actor, {
    action: "notice.create",
    resourceType: "notice",
    resourceId: created.id,
    summary: `Drafted “${parsed.title}”`,
  });
  return { id: created.id, slug };
}

const NOTICE_LIFECYCLE = {
  publish: { status: "published", publicVisible: true },
  unpublish: { status: "unpublished", publicVisible: false },
  archive: { status: "archived", publicVisible: false },
  schedule: { status: "scheduled", publicVisible: false },
} as const;

export type NoticeAction = keyof typeof NOTICE_LIFECYCLE;

/**
 * Moves a notice to another state, and refuses to publish one with nothing in it.
 *
 * Scheduling stores a release time; `releaseDueNotices` is what turns it into a
 * live notice. There is no background worker in this build, so the panel shows
 * the pending items and the button that releases them rather than pretending a
 * timer exists.
 */
export async function setNoticeStatus(
  actor: Principal,
  id: string,
  action: NoticeAction,
  options: { publishAt?: string | null } = {},
): Promise<void> {
  const notice = await findDocById("notices", id);
  if (!notice) throw new ContentRejectedError("That notice no longer exists.");

  const change = NOTICE_LIFECYCLE[action];
  if (action === "publish") {
    if (notice.body.trim().length === 0 || notice.title.trim().length === 0) {
      throw new ContentRejectedError("A notice needs a title and text before it can be published.");
    }
    if (notice.expiresOn && notice.expiresOn < todayIso()) {
      throw new ContentRejectedError("That notice's display period has already closed — archive it instead.");
    }
  }

  const set: Partial<NoticesDoc> = { ...change, updatedByUserId: actor.userId };
  if (action === "publish") {
    set.publishedAt = notice.publishedAt ?? new Date();
    set.archivedAt = null;
  }
  if (action === "schedule") {
    const when = asDate(options.publishAt ?? null);
    if (!when || when.getTime() <= Date.now()) {
      throw new ContentRejectedError("Choose a release time in the future.");
    }
    set.publishAt = when;
  }
  if (action === "archive") set.archivedAt = new Date();

  await updateOneDoc("notices", { id }, set);
  await setNoticeAttachmentVisibility(id, action === "publish" ? "public" : "restricted");
  await recordAuditFor(actor, {
    action: action === "publish" ? "notice.publish" : "notice.edit",
    resourceType: "notice",
    resourceId: id,
    summary: `${action === "publish" ? "Published" : action === "unpublish" ? "Took down" : action === "archive" ? "Archived" : "Scheduled"} “${notice.title}”`,
  });
}

/** Releases every scheduled notice whose time has passed. Returns how many. */
export async function releaseDueNotices(actor: Principal | null): Promise<number> {
  const due = await findDocs("notices", {
    status: "scheduled",
    publishAt: { $ne: null, $lte: new Date() },
  });
  for (const notice of due) {
    await updateOneDoc("notices", { id: notice.id }, {
      status: "published",
      publicVisible: true,
      publishedAt: new Date(),
    });
    await setNoticeAttachmentVisibility(notice.id, "public");
    if (actor) {
      await recordAuditFor(actor, {
        action: "notice.publish",
        resourceType: "notice",
        resourceId: notice.id,
        summary: `Released scheduled notice “${notice.title}”`,
      });
    }
  }
  return due.length;
}

export async function deleteNotice(actor: Principal, id: string): Promise<void> {
  const notice = await findDocById("notices", id);
  if (!notice) throw new ContentRejectedError("That notice no longer exists.");
  // Attachments belong to the notice, so they go with it; the file rows are
  // retired rather than erased, because the bytes may be referenced elsewhere.
  await deleteDocs("notice_documents", { noticeId: id });
  await deleteDocs("notices", { id });
  await recordAuditFor(actor, {
    action: "notice.delete",
    resourceType: "notice",
    resourceId: id,
    summary: `Deleted “${notice.title}”`,
  });
}

/* -------------------------------------------------------------------------- */
/* Notice attachments                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Opens or closes every PDF attached to a notice.
 *
 * A circular is the school's word in documentary form, and the download route
 * decides by the document row alone. So an attachment is `restricted` while its
 * notice is a draft or scheduled — the bytes exist and the panel can see them —
 * and becomes `public` at the moment the notice reaches the board, and restricted
 * again the moment it leaves. A dated order cannot be fetched from a notice that
 * was taken down for a correction.
 */
async function setNoticeAttachmentVisibility(
  noticeId: string,
  visibility: "public" | "restricted",
): Promise<void> {
  const links = await findDocs("notice_documents", { noticeId }, { projection: { documentId: 1 } });
  for (const link of links) {
    await updateOneDoc("documents", { id: link.documentId }, { visibility });
  }
}

export type NoticeAttachmentRow = {
  documentId: string;
  label: string | null;
  title: string | null;
  mimeType: string;
  sizeBytes: number;
  /** Whether the public site can reach it, which is a property of the notice, not the file. */
  downloadable: boolean;
};

export async function listNoticeAttachmentsForAdmin(noticeId: string): Promise<NoticeAttachmentRow[]> {
  const links = await findDocs("notice_documents", { noticeId }, { sort: { sortOrder: 1 } });
  const rows = await byIdsForAdmin(links.map((link) => link.documentId));
  return links.flatMap((link) => {
    const file = rows.get(link.documentId);
    if (!file) return [];
    return [
      {
        documentId: file.id,
        label: link.label ?? null,
        title: file.title ?? null,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        downloadable: file.visibility === "public" && file.status === "published" && !file.deletedAt,
      },
    ];
  });
}

async function byIdsForAdmin(ids: string[]) {
  const rows = ids.length === 0 ? [] : await findDocs("documents", { id: { $in: ids } });
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * Attaches circulars to a notice.
 *
 * The same magic-byte rule as a photograph, and the same lock: what lands here is
 * unreadable by the public until the notice publishes. A notice that is already
 * published therefore gains a downloadable attachment straight away, because that
 * is what the office meant when it pinned a PDF to a live announcement.
 */
export async function addNoticeAttachments(
  actor: Principal,
  noticeId: string,
  files: File[],
  label?: string | null,
): Promise<{ added: number; rejected: string[] }> {
  const notice = await findDocById("notices", noticeId);
  if (!notice) throw new ContentRejectedError("That notice no longer exists.");
  if (files.length === 0) throw new ContentRejectedError("Choose at least one file.");
  if (files.length > 8) throw new ContentRejectedError("Attach at most eight files to one notice.");

  const existing = await findDocs("notice_documents", { noticeId }, { sort: { sortOrder: -1 }, limit: 1 });
  let sortOrder = existing[0]?.sortOrder ?? 0;
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
    let stored;
    try {
      stored = await storeFile({
        buffer,
        originalFilename: file.name,
        declaredMimeType: file.type || "",
        kind: "notice_attachment",
        title: file.name,
        category: "notice",
        visibility: notice.status === "published" && notice.publicVisible ? "public" : "restricted",
        uploadedBy: actor.userId,
      });
    } catch (error) {
      if (error instanceof FileRejectedError) {
        rejected.push(`${file.name}: ${error.message}`);
        continue;
      }
      throw error;
    }
    sortOrder += 10;
    await insertDoc("notice_documents", {
      noticeId,
      documentId: stored.id,
      label: label?.trim() || null,
      sortOrder,
    });
    added += 1;
  }

  await recordAuditFor(actor, {
    action: "document.upload",
    resourceType: "notice",
    resourceId: noticeId,
    summary: `Attached ${added} file${added === 1 ? "" : "s"} to “${notice.title}”`,
    metadata: { rejected: rejected.length },
  });
  return { added, rejected };
}

export async function removeNoticeAttachment(
  actor: Principal,
  noticeId: string,
  documentId: string,
): Promise<void> {
  const link = await findDoc("notice_documents", { noticeId, documentId });
  if (!link) throw new ContentRejectedError("That file is not attached to this notice.");
  const notice = await findDocById("notices", noticeId);
  await deleteDocs("notice_documents", { id: link.id });
  // The bytes stay on file — a document row can be referenced by more than one
  // notice — but they are locked, because nothing public points at them now.
  await updateOneDoc("documents", { id: documentId }, { visibility: "restricted", status: "archived" });
  await recordAuditFor(actor, {
    action: "document.delete",
    resourceType: "notice",
    resourceId: noticeId,
    summary: `Detached a file from “${notice?.title ?? "a notice"}”`,
  });
}

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

export const eventSchema = z.object({
  id: optionalText(60),
  title: z.string().trim().min(4, "Give the event a title.").max(200),
  summary: optionalText(600),
  description: optionalText(20000),
  categoryKey: optionalText(60),
  /** Local ISO strings from a `datetime-local` input. */
  startsAt: z.string().trim().min(4, "Give the event a start date and time.").max(40),
  endsAt: optionalText(40),
  allDay: z.boolean(),
  venue: optionalText(200),
  featured: z.boolean(),
});

export type EventAdminRow = {
  id: string;
  slug: string;
  title: string;
  categoryName: string | null;
  status: DocOf<"events">["status"];
  publicVisible: boolean;
  startsAt: Date;
  endsAt: Date | null;
  venue: string | null;
  featured: boolean;
};

export async function listEventsForAdmin(): Promise<EventAdminRow[]> {
  const rows = await findDocs("events", {}, { sort: { startsAt: -1 }, limit: 200 });
  const categories = await findDocs("event_categories", {});
  const byId = new Map(categories.map((category) => [category.id, category]));
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    categoryName: row.categoryId ? byId.get(row.categoryId)?.name ?? null : null,
    status: row.status,
    publicVisible: row.publicVisible ?? false,
    startsAt: row.startsAt,
    endsAt: row.endsAt ?? null,
    venue: row.venue ?? null,
    featured: row.featured ?? false,
  }));
}

export async function getEventForAdmin(id: string) {
  const row = await findDocById("events", id);
  if (!row) return null;
  const category = row.categoryId ? await findDoc("event_categories", { id: row.categoryId }) : null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? "",
    description: row.description ?? "",
    categoryKey: category?.key ?? "",
    startsAt: toLocalInput(row.startsAt),
    endsAt: row.endsAt ? toLocalInput(row.endsAt) : "",
    allDay: row.allDay ?? false,
    venue: row.venue ?? "",
    featured: row.featured ?? false,
    status: row.status,
    publicVisible: row.publicVisible ?? false,
  };
}

/** A `datetime-local` value for the row's own instant, without a zone shift. */
function toLocalInput(value: Date): string {
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export async function saveEvent(actor: Principal, input: z.input<typeof eventSchema>) {
  const parsed = eventSchema.parse(input);
  const startsAt = asDate(parsed.startsAt);
  if (!startsAt) throw new ContentRejectedError("The event needs a start date and time.");
  const endsAt = asDate(parsed.endsAt ?? null);
  if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw new ContentRejectedError("The event ends before it starts.");
  }

  const category = parsed.categoryKey
    ? await findDoc("event_categories", { key: parsed.categoryKey })
    : null;
  if (parsed.categoryKey && !category) throw new ContentRejectedError("That event category does not exist.");

  const existing = parsed.id ? await findDocById("events", parsed.id) : null;
  if (parsed.id && !existing) throw new ContentRejectedError("That event no longer exists.");

  const slug = await uniqueSlug("events", parsed.title, existing?.id);
  const values = {
    title: parsed.title,
    slug,
    summary: parsed.summary,
    description: parsed.description,
    categoryId: category?.id ?? null,
    startsAt,
    endsAt,
    allDay: parsed.allDay,
    venue: parsed.venue,
    featured: parsed.featured,
  };

  if (existing) {
    await replaceDoc("events", { id: existing.id }, values);
    await recordAuditFor(actor, {
      action: "event.edit",
      resourceType: "event",
      resourceId: existing.id,
      summary: `Edited event “${parsed.title}”`,
    });
    return { id: existing.id, slug };
  }

  const created = await insertDoc("events", {
    ...values,
    occurrenceState: "single",
    status: "draft",
    publicVisible: false,
    approvalStatus: "not_required",
    registrationRequired: false,
    createdByUserId: actor.userId,
  });
  await recordAuditFor(actor, {
    action: "event.create",
    resourceType: "event",
    resourceId: created.id,
    summary: `Created event “${parsed.title}”`,
  });
  return { id: created.id, slug };
}

export async function setEventStatus(
  actor: Principal,
  id: string,
  action: "publish" | "unpublish" | "archive",
): Promise<void> {
  const event = await findDocById("events", id);
  if (!event) throw new ContentRejectedError("That event no longer exists.");
  const set: Partial<DocOf<"events">> =
    action === "publish"
      ? { status: "published", publicVisible: true, publishedAt: event.publishedAt ?? new Date(), archivedAt: null }
      : action === "unpublish"
        ? { status: "unpublished", publicVisible: false }
        : { status: "archived", publicVisible: false, archivedAt: new Date() };
  await updateOneDoc("events", { id }, set);
  await recordAuditFor(actor, {
    action: action === "publish" ? "event.publish" : "event.edit",
    resourceType: "event",
    resourceId: id,
    summary: `${action === "publish" ? "Published" : action === "unpublish" ? "Took down" : "Archived"} event “${event.title}”`,
  });
}

/**
 * Removes an event outright.
 *
 * An event that has already happened is history and should be archived; this is
 * for the one that was typed wrongly or cancelled before anyone was told. Its
 * registrations go with it, which is why the permission for it is rarer than the
 * one for editing.
 */
export async function deleteEvent(actor: Principal, id: string): Promise<void> {
  const event = await findDocById("events", id);
  if (!event) throw new ContentRejectedError("That event no longer exists.");
  await deleteDocs("event_registrations", { eventId: id }, { cascade: true });
  await deleteDocs("event_documents", { eventId: id });
  await deleteDocs("events", { id });
  await recordAuditFor(actor, {
    action: "event.delete",
    resourceType: "event",
    resourceId: id,
    summary: `Deleted event “${event.title}”`,
  });
}

/* -------------------------------------------------------------------------- */
/* Gallery: albums, photographs, consent, publication                          */
/* -------------------------------------------------------------------------- */
export const albumSchema = z.object({
  id: optionalText(60),
  title: z.string().trim().min(3, "Give the album a title.").max(160),
  description: optionalText(2000),
  categoryKey: optionalText(60),
});

export type AlbumAdminRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  categoryName: string | null;
  status: DocOf<"gallery_albums">["status"];
  consentCleared: boolean;
  photoCount: number;
  pendingConsent: number;
  publishedAt: Date | null;
  coverDocumentId: string | null;
};

export async function listAlbumsForAdmin(): Promise<AlbumAdminRow[]> {
  const albums = await findDocs("gallery_albums", {}, { sort: { updatedAt: -1 }, limit: 200 });
  const categories = await findDocs("gallery_categories", {});
  const byId = new Map(categories.map((category) => [category.id, category]));
  const items = await findDocs("gallery_items", {
    albumId: { $in: albums.map((album) => album.id) },
  });
  const perAlbum = new Map<string, typeof items>();
  for (const item of items) {
    const bucket = perAlbum.get(item.albumId) ?? [];
    bucket.push(item);
    perAlbum.set(item.albumId, bucket);
  }

  return albums.map((album) => {
    const frames = perAlbum.get(album.id) ?? [];
    return {
      id: album.id,
      title: album.title,
      slug: album.slug,
      description: album.description ?? null,
      categoryName: album.categoryId ? byId.get(album.categoryId)?.name ?? null : null,
      status: album.status,
      consentCleared: album.consentCleared ?? false,
      photoCount: frames.length,
      pendingConsent: frames.filter(
        (frame) => frame.containsIdentifiableMinors && frame.consentStatus !== "granted",
      ).length,
      publishedAt: album.publishedAt ?? null,
      coverDocumentId: album.coverDocumentId ?? null,
    };
  });
}

export async function getAlbumForAdmin(id: string) {
  const album = await findDocById("gallery_albums", id);
  if (!album) return null;
  const category = album.categoryId ? await findDoc("gallery_categories", { id: album.categoryId }) : null;
  const items = await findDocs("gallery_items", { albumId: id }, { sort: { sortOrder: 1 } });
  const files = await findDocs("documents", { id: { $in: items.map((item) => item.documentId) } });
  const fileById = new Map(files.map((file) => [file.id, file]));
  return {
    id: album.id,
    title: album.title,
    slug: album.slug,
    description: album.description ?? "",
    categoryKey: category?.key ?? "",
    status: album.status,
    consentCleared: album.consentCleared ?? false,
    coverDocumentId: album.coverDocumentId ?? null,
    items: items.map((item) => {
      const file = fileById.get(item.documentId);
      return {
        id: item.id,
        documentId: item.documentId,
        caption: item.caption ?? "",
        credit: item.credit ?? "",
        containsIdentifiableMinors: item.containsIdentifiableMinors ?? false,
        consentStatus: item.consentStatus,
        altText: file?.altText ?? null,
        widthPx: file?.widthPx ?? null,
        heightPx: file?.heightPx ?? null,
        mimeType: file?.mimeType ?? null,
      };
    }),
  };
}

export type AlbumSaveResult = { id: string; slug: string };

export async function saveAlbum(actor: Principal, input: z.input<typeof albumSchema>): Promise<AlbumSaveResult> {
  const parsed = albumSchema.parse(input);
  const category = parsed.categoryKey
    ? await findDoc("gallery_categories", { key: parsed.categoryKey })
    : null;
  if (parsed.categoryKey && !category) throw new ContentRejectedError("That gallery category does not exist.");

  const existing = parsed.id ? await findDocById("gallery_albums", parsed.id) : null;
  if (parsed.id && !existing) throw new ContentRejectedError("That album no longer exists.");

  const slug = await uniqueSlug("gallery_albums", parsed.title, existing?.id);
  const values = {
    title: parsed.title,
    slug,
    description: parsed.description,
    categoryId: category?.id ?? null,
  };

  if (existing) {
    await replaceDoc("gallery_albums", { id: existing.id }, values);
    await recordAuditFor(actor, {
      action: "gallery.edit",
      resourceType: "gallery_album",
      resourceId: existing.id,
      summary: `Edited album “${parsed.title}”`,
    });
    return { id: existing.id, slug };
  }

  const created = await insertDoc("gallery_albums", {
    ...values,
    status: "draft",
    consentCleared: false,
  });
  await recordAuditFor(actor, {
    action: "gallery.edit",
    resourceType: "gallery_album",
    resourceId: created.id,
    summary: `Created album “${parsed.title}”`,
  });
  return { id: created.id, slug };
}

/**
 * The document rows behind an album's frames are made readable, or withheld.
 *
 * A photograph lands in storage as `restricted`, so it is not fetchable by URL
 * until the album it belongs to passes the consent gate and is published. Taking
 * an album down — or changing one frame's consent after the album was cleared —
 * puts every frame back behind that lock, because the file endpoint decides by
 * the document row alone and does not know which album a picture came from.
 */
async function setAlbumFrameVisibility(albumId: string, visibility: "public" | "restricted"): Promise<void> {
  const items = await findDocs("gallery_items", { albumId }, { projection: { documentId: 1 } });
  for (const item of items) {
    await updateOneDoc("documents", { id: item.documentId }, { visibility });
  }
}

/**
 * Adds uploaded photographs to an album.
 *
 * Every frame starts with consent `pending` when it is marked as containing
 * identifiable children, which is the default the uploader declares. A frame
 * cannot be published on the assumption that consent exists.
 */
export async function addAlbumPhotos(
  actor: Principal,
  albumId: string,
  files: File[],
  options: { containsIdentifiableMinors: boolean; altText?: string | null },
): Promise<{ added: number; rejected: string[] }> {
  const album = await findDocById("gallery_albums", albumId);
  if (!album) throw new ContentRejectedError("That album no longer exists.");
  if (files.length === 0) throw new ContentRejectedError("Choose at least one photograph.");
  if (files.length > 24) throw new ContentRejectedError("Upload at most 24 photographs at a time.");

  const existing = await findDocs("gallery_items", { albumId }, { sort: { sortOrder: -1 }, limit: 1 });
  let sortOrder = existing[0]?.sortOrder ?? 0;
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
    let stored;
    try {
      stored = await storeFile({
        buffer,
        originalFilename: file.name,
        declaredMimeType: file.type || "",
        kind: "image",
        title: file.name,
        altText: options.altText ?? null,
        category: "gallery",
        // Held back until the album publishes; see `setAlbumFrameVisibility`.
        visibility: "restricted",
        uploadedBy: actor.userId,
      });
    } catch (error) {
      if (error instanceof FileRejectedError) {
        rejected.push(`${file.name}: ${error.message}`);
        continue;
      }
      throw error;
    }
    sortOrder += 10;
    await insertDoc("gallery_items", {
      albumId,
      documentId: stored.id,
      containsIdentifiableMinors: options.containsIdentifiableMinors,
      consentStatus: options.containsIdentifiableMinors ? "pending" : "not_required",
      sortOrder,
    });
    added += 1;
  }

  await recordAuditFor(actor, {
    action: "gallery.edit",
    resourceType: "gallery_album",
    resourceId: albumId,
    summary: `Added ${added} photograph${added === 1 ? "" : "s"} to “${album.title}”`,
    metadata: { rejected: rejected.length },
  });
  return { added, rejected };
}

export async function setPhotoConsent(
  actor: Principal,
  itemId: string,
  consentStatus: "pending" | "granted" | "withdrawn" | "not_required",
): Promise<void> {
  const item = await findDocById("gallery_items", itemId);
  if (!item) throw new ContentRejectedError("That photograph is no longer in an album.");
  await updateOneDoc("gallery_items", { id: itemId }, { consentStatus });

  // Any change to a single frame invalidates a clearance for the whole album:
  // the flag means "every child here was checked", not "someone checked once".
  if (item.consentStatus !== consentStatus) await clearAlbumConsent(actor, item.albumId, "a frame changed");
}

async function clearAlbumConsent(actor: Principal, albumId: string, reason: string): Promise<void> {
  const album = await findDocById("gallery_albums", albumId);
  if (!album?.consentCleared) return;
  await updateOneDoc("gallery_albums", { id: albumId }, {
    consentCleared: false,
    consentVerifiedAt: null,
    consentVerifiedByUserId: null,
    status: "draft",
  });
  await setAlbumFrameVisibility(albumId, "restricted");
  await recordAuditFor(actor, {
    action: "gallery.publish",
    resourceType: "gallery_album",
    resourceId: albumId,
    summary: `Withdrew the published album “${album.title}” because ${reason}`,
  });
}

export async function setPhotoCaption(
  actor: Principal,
  itemId: string,
  fields: { caption?: string | null; credit?: string | null; altText?: string | null },
): Promise<void> {
  const item = await findDocById("gallery_items", itemId);
  if (!item) throw new ContentRejectedError("That photograph is no longer in an album.");
  await replaceDoc("gallery_items", { id: itemId }, {
    caption: fields.caption?.trim() || null,
    credit: fields.credit?.trim() || null,
  });
  if (typeof fields.altText === "string") {
    await updateOneDoc("documents", { id: item.documentId }, { altText: fields.altText.trim() || null });
  }
  await recordAuditFor(actor, {
    action: "gallery.edit",
    resourceType: "gallery_item",
    resourceId: itemId,
    summary: "Updated a photograph caption",
  });
}

export async function setAlbumCover(actor: Principal, albumId: string, documentId: string): Promise<void> {
  const album = await findDocById("gallery_albums", albumId);
  if (!album) throw new ContentRejectedError("That album no longer exists.");
  const item = await findDoc("gallery_items", { albumId, documentId });
  if (!item) throw new ContentRejectedError("That photograph is not in this album.");
  await updateOneDoc("gallery_albums", { id: albumId }, { coverDocumentId: documentId });
  await recordAuditFor(actor, {
    action: "gallery.edit",
    resourceType: "gallery_album",
    resourceId: albumId,
    summary: `Set the cover of “${album.title}”`,
  });
}

export async function removeAlbumPhoto(actor: Principal, itemId: string): Promise<void> {
  const item = await findDocById("gallery_items", itemId);
  if (!item) throw new ContentRejectedError("That photograph is no longer in an album.");
  await deleteDocs("gallery_items", { id: itemId });
  await updateOneDoc("documents", { id: item.documentId }, { visibility: "restricted" });
  const album = await findDocById("gallery_albums", item.albumId);
  if (album?.coverDocumentId === item.documentId) {
    await updateOneDoc("gallery_albums", { id: item.albumId }, { coverDocumentId: null });
  }
  await clearAlbumConsent(actor, item.albumId, "a frame was removed");
  await recordAuditFor(actor, {
    action: "gallery.edit",
    resourceType: "gallery_item",
    resourceId: itemId,
    summary: "Removed a photograph from an album",
  });
}

/**
 * Publishes an album.
 *
 * The gate is the point of the whole gallery: every frame that shows an
 * identifiable pupil must carry a granted consent, and the person clearing it
 * must hold the consent-verification permission, which is deliberately rarer
 * than the permission to upload.
 */
export async function publishAlbum(actor: Principal, albumId: string): Promise<void> {
  const album = await findDocById("gallery_albums", albumId);
  if (!album) throw new ContentRejectedError("That album no longer exists.");

  const items = await findDocs("gallery_items", { albumId });
  if (items.length === 0) throw new ContentRejectedError("An album with no photographs cannot be published.");

  // A withdrawn answer is reported before the general "no answer" case: it is a
  // different instruction from the school — take the photograph out — and the
  // person reading the message should not have to infer it.
  const withdrawn = items.filter((item) => item.consentStatus === "withdrawn");
  if (withdrawn.length > 0) {
    throw new ContentRejectedError("A withdrawn consent must be removed from the album before it can be published.");
  }

  const unverified = items.filter(
    (item) => item.containsIdentifiableMinors && item.consentStatus !== "granted",
  );
  if (unverified.length > 0) {
    throw new ContentRejectedError(
      `${unverified.length} photograph${unverified.length === 1 ? "" : "s"} still show${unverified.length === 1 ? "s" : ""} a pupil without recorded consent.`,
    );
  }

  await updateOneDoc("gallery_albums", { id: albumId }, {
    status: "published",
    consentCleared: true,
    consentVerifiedByUserId: actor.userId,
    consentVerifiedAt: new Date(),
    publishedAt: album.publishedAt ?? new Date(),
  });
  await setAlbumFrameVisibility(albumId, "public");
  await recordAuditFor(actor, {
    action: "gallery.publish",
    resourceType: "gallery_album",
    resourceId: albumId,
    summary: `Published “${album.title}” with ${items.length} photograph${items.length === 1 ? "" : "s"}`,
    metadata: { frames: items.length, minorFrames: items.filter((i) => i.containsIdentifiableMinors).length },
  });
}

export async function unpublishAlbum(actor: Principal, albumId: string): Promise<void> {
  const album = await findDocById("gallery_albums", albumId);
  if (!album) throw new ContentRejectedError("That album no longer exists.");
  await updateOneDoc("gallery_albums", { id: albumId }, {
    status: "unpublished",
    consentCleared: false,
    consentVerifiedAt: null,
    consentVerifiedByUserId: null,
  });
  await setAlbumFrameVisibility(albumId, "restricted");
  await recordAuditFor(actor, {
    action: "gallery.publish",
    resourceType: "gallery_album",
    resourceId: albumId,
    summary: `Took down the album “${album.title}”`,
  });
}

/* -------------------------------------------------------------------------- */
/* Homepage slideshow                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Chooses which published albums the homepage cycles through.
 *
 * The order is the order shown. An album that is not published, or whose
 * consent has lapsed, is filtered out here as well, so a stale list cannot
 * leave a photograph on the largest frame of the site.
 */
export async function setHeroAlbums(actor: Principal, slugs: string[]): Promise<{ accepted: string[] }> {
  const wanted = [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))].slice(0, 12);
  // Only an album that still qualifies may stay in the list; a frame that was
  // published when it was chosen and has since been taken down cannot remain.
  const kept: string[] = [];
  for (const slug of wanted) {
    const album = await findDoc("gallery_albums", { slug, status: "published", consentCleared: true });
    if (album) kept.push(album.slug);
  }
  // Someone ticked albums and none of them qualify. Leave the stored choice
  // untouched rather than writing "none", which would silently turn the
  // slideshow off under the impression that a frame had been chosen.
  if (wanted.length > 0 && kept.length === 0) {
    return { accepted: [] };
  }
  const accepted = kept;
  await upsertDoc(
    "school_settings",
    { key: "site.hero_albums" },
    {
      // `none` is a deliberate value, not a blank: the absence of a row means
      // nobody has chosen yet, and the homepage then falls back to the newest
      // published albums. `none` means the school looked and said no slideshow.
      value: accepted.length > 0 ? accepted.join(", ") : "none",
      isConfirmed: true,
      updatedByUserId: actor.userId,
    },
    {
      label: "Homepage slideshow albums",
      group: "website",
      inputKind: "text",
      sortOrder: 250,
      description: "Comma-separated album slugs, in the order they appear on the homepage.",
    },
  );
  await recordAuditFor(actor, {
    action: "homepage.edit",
    resourceType: "school_setting",
    resourceId: "site.hero_albums",
    summary: accepted.length ? `Set the homepage slideshow to ${accepted.length} album(s)` : "Cleared the homepage slideshow",
    metadata: { accepted },
  });
  return { accepted };
}

/* -------------------------------------------------------------------------- */
/* The panel's own counts                                                      */
/* -------------------------------------------------------------------------- */

export async function contentOverview() {
  const [
    notices,
    drafts,
    scheduled,
    events,
    albums,
    publishedAlbums,
    settings,
    sections,
    pages,
    testimonials,
    achievements,
    documents,
    applications,
    enquiries,
  ] = await Promise.all([
    findDocs("notices", { status: "published", publicVisible: true, archivedAt: null }, { projection: { id: 1 } }),
    findDocs("notices", { status: "draft" }, { projection: { id: 1 } }),
    findDocs("notices", { status: "scheduled" }, { projection: { id: 1 } }),
    findDocs("events", { status: "published", publicVisible: true, archivedAt: null, startsAt: { $gte: new Date() } }, { projection: { id: 1 } }),
    findDocs("gallery_albums", {}, { projection: { id: 1 } }),
    findDocs("gallery_albums", { status: "published", consentCleared: true }, { projection: { id: 1 } }),
    findDocs("school_settings", { isConfirmed: false }, { projection: { id: 1 } }),
    findDocs("homepage_sections", { visible: true }, { projection: { id: 1 } }),
    findDocs("content_pages", { status: "draft" }, { projection: { id: 1 } }),
    findDocs("testimonials", { status: "draft" }, { projection: { id: 1 } }),
    findDocs("achievements", { status: "draft" }, { projection: { id: 1 } }),
    findDocs("documents", { visibility: "public", deletedAt: null, status: "published" }, { projection: { id: 1 } }),
    findDocs(
      "admission_applications",
      { status: { $in: ["submitted", "under_review", "documents_required"] } },
      { projection: { id: 1 } },
    ),
    findDocs("contact_enquiries", { status: { $in: ["open", "in_progress"] } }, { projection: { id: 1 } }),
  ]);
  return {
    liveNotices: notices.length,
    draftNotices: drafts.length,
    scheduledNotices: scheduled.length,
    upcomingEvents: events.length,
    albums: albums.length,
    publishedAlbums: publishedAlbums.length,
    unconfirmedSettings: settings.length,
    visibleSections: sections.length,
    draftPages: pages.length,
    draftTestimonials: testimonials.length,
    draftAchievements: achievements.length,
    publicDocuments: documents.length,
    openApplications: applications.length,
    openEnquiries: enquiries.length,
  };
}
