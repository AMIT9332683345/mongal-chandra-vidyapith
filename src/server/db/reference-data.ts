import {
  deleteDocs,
  findDoc,
  findDocs,
  insertDoc,
  insertIfAbsent,
  upsertDoc,
} from "@/server/db/mongo/repository";
import type { JsonValue } from "@/server/db/mongo/schema.generated";

/**
 * The configuration a fresh database needs before it can be used.
 *
 * This module writes structure, never facts about the school. Roles,
 * permissions, category taxonomies and attendance statuses are the vocabulary
 * an administrator edits from; everything the school itself would state —
 * address, telephone, founding year, principal, roll strength, which facilities
 * exist — is created as an explicitly *unconfirmed* row so the public site can
 * render it as a gap. Nothing here invents a single detail.
 *
 * Safe to re-run. Reference rows are upserted, an administrator's edited values
 * are never overwritten, and grants are additive unless `pruneGrants` is asked
 * for.
 */

export type PermissionRow = {
  key: string;
  resource: string;
  action: string;
  description: string;
  isSensitive: boolean;
};

export type RoleRow = {
  key: string;
  name: string;
  description: string;
  dashboardPath: string;
  sortOrder: number;
  permissions: string[];
};

export type SeedCounts = Record<string, number>;

const ACADEMIC_YEAR_PLACEHOLDER_REMARKS =
  "Placeholder session created by the seed. Confirm the real dates in the administrator panel.";

/* -------------------------------------------------------------------------- */
/* Reference data                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Attendance vocabulary. `countsAsPresent` and `countsAsAttendance` are stored
 * rather than inferred from the key, because schools disagree about whether a
 * late mark or an approved leave counts towards a percentage.
 */
const ATTENDANCE_STATUSES = [
  { key: "present", label: "Present", countsAsPresent: true, countsAsAttendance: true, colorToken: "olive", sortOrder: 10 },
  { key: "absent", label: "Absent", countsAsPresent: false, countsAsAttendance: true, colorToken: "terracotta", sortOrder: 20 },
  { key: "late", label: "Late", countsAsPresent: true, countsAsAttendance: true, colorToken: "amber", sortOrder: 30 },
  { key: "leave", label: "Approved leave", countsAsPresent: false, countsAsAttendance: false, colorToken: "neutral", sortOrder: 40 },
  { key: "exempted", label: "Exempted", countsAsPresent: false, countsAsAttendance: false, colorToken: "neutral", sortOrder: 50 },
];

const NOTICE_CATEGORIES = [
  { key: "general", name: "General", sortOrder: 10 },
  { key: "academic", name: "Academic", sortOrder: 20 },
  { key: "examination", name: "Examination", sortOrder: 30 },
  { key: "holiday", name: "Holiday", sortOrder: 40 },
  { key: "admission", name: "Admission", sortOrder: 50 },
  { key: "cultural", name: "Cultural programme", sortOrder: 60 },
  { key: "sports", name: "Sports", sortOrder: 70 },
  { key: "competition", name: "Competition", sortOrder: 80 },
  { key: "emergency", name: "Emergency", isEmergency: true, notifyOnPublish: true, sortOrder: 90 },
];

/**
 * Event categories are the taxonomy a coordinator picks from, not a calendar of
 * claims. A school that does not hold a particular celebration deactivates the
 * row; one that adds a foundation day creates a new one.
 */
const EVENT_CATEGORIES = [
  { key: "academic", name: "Academic programme", group: "Academic", sortOrder: 10 },
  { key: "annual_function", name: "Annual function", group: "Celebration", recurringAnnually: true, sortOrder: 20 },
  { key: "cultural", name: "Cultural programme", group: "Celebration", sortOrder: 30 },
  { key: "national_day", name: "National day", group: "Celebration", recurringAnnually: true, sortOrder: 40 },
  { key: "sports", name: "Sports", group: "Sports", sortOrder: 50 },
  { key: "competition", name: "Competition", group: "Academic", sortOrder: 60 },
  { key: "exhibition", name: "Exhibition", group: "Academic", sortOrder: 70 },
  { key: "tour", name: "Educational tour or excursion", group: "Activity", sortOrder: 80 },
  { key: "community", name: "Community outreach", group: "Activity", sortOrder: 90 },
  { key: "awareness", name: "Awareness programme", group: "Activity", sortOrder: 100 },
  { key: "assembly", name: "Special assembly", group: "Activity", sortOrder: 110 },
  { key: "ceremony", name: "Prize distribution or ceremony", group: "Celebration", sortOrder: 120 },
];

const GALLERY_CATEGORIES = [
  { key: "campus", name: "Campus", sortOrder: 10 },
  { key: "classrooms", name: "Classrooms", sortOrder: 20 },
  { key: "laboratories", name: "Laboratories", sortOrder: 30 },
  { key: "library", name: "Library", sortOrder: 40 },
  { key: "sports", name: "Sports", sortOrder: 50 },
  { key: "cultural", name: "Cultural programmes", sortOrder: 60 },
  { key: "student_life", name: "Student activities", sortOrder: 70 },
  { key: "trips", name: "Educational trips", sortOrder: 80 },
  { key: "achievements", name: "Achievements", sortOrder: 90 },
];

type SettingSeed = {
  key: string;
  label: string;
  group: string;
  inputKind: string;
  /** A setting's answer is any JSON value: a name is a string, a roll number a number. */
  value: JsonValue;
  confirmed: boolean;
  note?: string;
};

/**
 * Every row an editable content surface needs to exist, with the school's own
 * answers left blank and annotated. `confirmed: true` appears exactly once: the
 * institution's name is the one fact this project was given.
 */
const SCHOOL_SETTINGS: SettingSeed[] = [
  { key: "school.name", label: "Official school name", group: "identity", inputKind: "text", value: "Mongal Chandra Vidyapith", confirmed: true },
  { key: "school.name_local", label: "School name in the local language", group: "identity", inputKind: "text", value: null, confirmed: false, note: "Not yet supplied by the school." },
  { key: "school.tagline", label: "Tagline", group: "identity", inputKind: "text", value: null, confirmed: false, note: "Awaiting the school's own wording." },
  { key: "school.logo_document_id", label: "School logo", group: "identity", inputKind: "document", value: null, confirmed: false },
  { key: "school.address", label: "Postal address", group: "contact", inputKind: "textarea", value: null, confirmed: false, note: "Must be provided by the school before it appears on the site." },
  { key: "school.phone", label: "Office telephone", group: "contact", inputKind: "tel", value: null, confirmed: false, note: "Must be provided by the school." },
  { key: "school.email", label: "Official email", group: "contact", inputKind: "email", value: null, confirmed: false, note: "Must be provided by the school." },
  { key: "school.office_hours", label: "Office hours", group: "contact", inputKind: "text", value: null, confirmed: false },
  { key: "school.data_protection_contact", label: "Data protection contact", group: "contact", inputKind: "text", value: null, confirmed: false, note: "Named person or role families may write to about their child's records." },
  { key: "school.map_url", label: "Map link", group: "contact", inputKind: "url", value: null, confirmed: false, note: "Map share link for the campus." },
  { key: "school.established_year", label: "Year established", group: "history", inputKind: "number", value: null, confirmed: false, note: "Only publish a founding year the school has confirmed." },
  { key: "school.principal_name", label: "Principal's name", group: "leadership", inputKind: "text", value: null, confirmed: false, note: "Used in the Principal's message block." },
  { key: "school.principal_message", label: "Principal's message", group: "leadership", inputKind: "rich_text", value: null, confirmed: false },
  { key: "school.vision", label: "Vision", group: "leadership", inputKind: "rich_text", value: null, confirmed: false },
  { key: "school.mission", label: "Mission", group: "leadership", inputKind: "rich_text", value: null, confirmed: false },
  { key: "school.values", label: "School values", group: "leadership", inputKind: "rich_text", value: null, confirmed: false },
  { key: "school.board", label: "Curriculum or board", group: "academic", inputKind: "text", value: null, confirmed: false, note: "The platform does not assume a board; the school states it." },
  { key: "school.student_count", label: "Roll strength", group: "statistics", inputKind: "number", value: null, confirmed: false, note: "Never publish an invented statistic." },
  { key: "school.teacher_count", label: "Teaching staff count", group: "statistics", inputKind: "number", value: null, confirmed: false },
  { key: "admission.open_from", label: "Admissions open from", group: "admissions", inputKind: "date", value: null, confirmed: false },
  { key: "admission.open_to", label: "Admissions close on", group: "admissions", inputKind: "date", value: null, confirmed: false },
  { key: "admission.contact_note", label: "Admission enquiry note", group: "admissions", inputKind: "textarea", value: null, confirmed: false },
  {
    key: "site.hero_albums",
    label: "Homepage slideshow albums",
    group: "website",
    inputKind: "text",
    value: null,
    confirmed: false,
    note: "Comma-separated album slugs, in the order they should appear. Leave empty to show the newest published albums. Only consent-cleared albums can appear.",
  },
];

/**
 * The named slots the homepage renders. Created empty and visible: an editor
 * fills them in the admin interface, and until then the page shows a marked
 * gap rather than invented prose about the school.
 */
const HOMEPAGE_SECTION_SLOTS = [
  { sectionKey: "welcome", heading: "Welcome", sortOrder: 10, note: "A short introduction to the school, written by the school." },
  { sectionKey: "principal_message", heading: "Principal's message", sortOrder: 20, note: "The message, and the principal's name, are both supplied by the school." },
  { sectionKey: "academic_highlights", heading: "Academic highlights", sortOrder: 30, note: "Written by the academic coordinator." },
  { sectionKey: "celebrations", heading: "Cultural programmes and celebrations", sortOrder: 40, note: "Describe the school's annual calendar of programmes." },
  { sectionKey: "sports", heading: "Sports and games", sortOrder: 50, note: "The games the school actually runs, and where they are played." },
  { sectionKey: "vision", heading: "What the school sets out to do", sortOrder: 60, note: "Vision or the reason families choose this school, in the school's own words." },
];

/**
 * Facility rows start unconfirmed, which the public site reads as "not
 * published yet" rather than as a claim that the school has them.
 */
const FACILITY_PLACEHOLDERS = [
  { slug: "classrooms", name: "Classrooms", group: "infrastructure", sortOrder: 10 },
  { slug: "library", name: "Library", group: "infrastructure", sortOrder: 20 },
  { slug: "science-laboratories", name: "Science laboratories", group: "academic", sortOrder: 30 },
  { slug: "computer-laboratory", name: "Computer laboratory", group: "academic", sortOrder: 40 },
  { slug: "playground", name: "Playground", group: "sports", sortOrder: 50 },
  { slug: "drinking-water", name: "Drinking water", group: "amenities", sortOrder: 60 },
  { slug: "sanitation", name: "Sanitation", group: "amenities", sortOrder: 70 },
  { slug: "accessibility", name: "Accessibility", group: "amenities", sortOrder: 80 },
  { slug: "safety", name: "Safety arrangements", group: "amenities", sortOrder: 90 },
  { slug: "transport", name: "Transportation", group: "amenities", sortOrder: 100 },
];

/* -------------------------------------------------------------------------- */
/* The seeder                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Writes the permission rows, then the role rows, then each role's expanded
 * grants. `expand` is the caller's, so this module stays independent of where
 * the role definitions live.
 */
export async function seedRbac(options: {
  permissions: PermissionRow[];
  roles: RoleRow[];
  expand: (patterns: string[]) => string[];
  pruneGrants?: boolean;
}): Promise<number> {
  for (const permission of options.permissions) {
    await upsertDoc(
      "permissions",
      { key: permission.key },
      {
        resource: permission.resource,
        action: permission.action,
        description: permission.description,
        isSensitive: permission.isSensitive,
      },
    );
  }

  for (const role of options.roles) {
    await upsertDoc(
      "roles",
      { key: role.key },
      {
        name: role.name,
        description: role.description,
        dashboardPath: role.dashboardPath,
        isSystem: true,
        sortOrder: role.sortOrder,
      },
    );
  }

  // Read back rather than `RETURNING`: an upsert does not report the row it matched.
  const roleRows = await findRoleRows(options.roles.map((role) => role.key));
  const idByKey = new Map(roleRows.map((row) => [row.key, row.id]));

  const grants: { roleId: string; permissionKey: string }[] = [];
  for (const role of options.roles) {
    // The super administrator's reach is derived in code from the role key, so
    // it survives the addition of a new permission without a re-seed.
    if (role.key === "super_admin") continue;
    const roleId = idByKey.get(role.key);
    if (!roleId) continue;
    for (const permissionKey of options.expand(role.permissions)) {
      grants.push({ roleId, permissionKey });
    }
  }

  if (options.pruneGrants) {
    const prunable = roleRows.filter((row) => row.key !== "super_admin").map((row) => row.id);
    for (const roleId of prunable) {
      await deleteDocs("role_permissions", { roleId }, { cascade: true });
    }
  }

  // Grants are additive by default: a super administrator may have narrowed a
  // role through the permissions panel, and a re-seed must not undo that.
  for (const grant of grants) {
    await insertIfAbsent("role_permissions", { roleId: grant.roleId, permissionKey: grant.permissionKey }, grant);
  }

  return grants.length;
}

async function findRoleRows(keys: string[]): Promise<{ id: string; key: string }[]> {
  const rows = await findDocs("roles", { key: { $in: keys } }, { projection: { id: 1, key: 1 } });
  return rows.map((row) => ({ id: row.id, key: row.key }));
}

async function upsertAttendanceStatuses(): Promise<number> {
  for (const status of ATTENDANCE_STATUSES) {
    await upsertDoc("attendance_statuses", { key: status.key }, status);
  }
  return ATTENDANCE_STATUSES.length;
}

async function upsertNoticeCategories(): Promise<number> {
  for (const category of NOTICE_CATEGORIES) {
    const values = {
      name: category.name,
      sortOrder: category.sortOrder,
      isEmergency: "isEmergency" in category ? category.isEmergency : false,
      notifyOnPublish: "notifyOnPublish" in category ? category.notifyOnPublish : false,
    };
    await upsertDoc("notice_categories", { key: category.key }, values);
  }
  return NOTICE_CATEGORIES.length;
}

async function upsertEventCategories(): Promise<number> {
  for (const category of EVENT_CATEGORIES) {
    const values = {
      name: category.name,
      group: category.group,
      recurringAnnually: "recurringAnnually" in category ? category.recurringAnnually : false,
      sortOrder: category.sortOrder,
    };
    await upsertDoc("event_categories", { key: category.key }, values);
  }
  return EVENT_CATEGORIES.length;
}

async function upsertGalleryCategories(): Promise<number> {
  for (const category of GALLERY_CATEGORIES) {
    await upsertDoc("gallery_categories", { key: category.key }, { name: category.name, sortOrder: category.sortOrder });
  }
  return GALLERY_CATEGORIES.length;
}

export async function seedReferenceData(
  options: { permissions: PermissionRow[]; roles: RoleRow[]; expand: (patterns: string[]) => string[]; pruneGrants?: boolean; createAcademicYearPlaceholder?: boolean },
): Promise<SeedCounts> {
  const counts: SeedCounts = {};

  counts.permissions = options.permissions.length;
  counts.roles = options.roles.length;
  counts.grants = await seedRbac(options);

  counts.attendanceStatuses = await upsertAttendanceStatuses();
  counts.noticeCategories = await upsertNoticeCategories();
  counts.eventCategories = await upsertEventCategories();
  counts.galleryCategories = await upsertGalleryCategories();

  // Settings are upserted without touching `value` or `isConfirmed`, so an
  // administrator's entered fact is never overwritten by a re-seed.
  for (const setting of SCHOOL_SETTINGS) {
    await upsertDoc(
      "school_settings",
      { key: setting.key },
      {
        label: setting.label,
        group: setting.group,
        inputKind: setting.inputKind,
        placeholderNote: setting.note ?? null,
      },
      {
        value: setting.value,
        isConfirmed: setting.confirmed,
        publicReadable: true,
      },
    );
  }
  counts.settings = SCHOOL_SETTINGS.length;

  for (const facility of FACILITY_PLACEHOLDERS) {
    await upsertDoc(
      "facilities",
      { slug: facility.slug },
      { name: facility.name, group: facility.group, sortOrder: facility.sortOrder },
      { summary: null, confirmed: false, publicVisible: true },
    );
  }
  counts.facilities = FACILITY_PLACEHOLDERS.length;

  // Slots exist so the homepage template has something to render against; the
  // prose is left empty for the school to write, with the authoring note kept
  // in metadata where only the admin interface reads it.
  for (const slot of HOMEPAGE_SECTION_SLOTS) {
    await upsertDoc(
      "homepage_sections",
      { sectionKey: slot.sectionKey },
      {
        heading: slot.heading,
        sortOrder: slot.sortOrder,
        metadata: { authoringNote: slot.note },
      },
      { body: null, visible: true },
    );
  }
  counts.homepageSections = HOMEPAGE_SECTION_SLOTS.length;

  counts.academicYears = 0;
  if (options.createAcademicYearPlaceholder !== false) {
    const current = await findDoc("academic_years", { isCurrent: true }, { projection: { id: 1 } });
    if (!current) {
      const year = new Date().getFullYear();
      await insertDoc("academic_years", {
        name: `${year}\u2013${year + 1}`,
        startDate: `${year}-04-01`,
        endDate: `${year + 1}-03-31`,
        isCurrent: true,
        remarks: ACADEMIC_YEAR_PLACEHOLDER_REMARKS,
      });
      counts.academicYears = 1;
    }
  }

  return counts;
}

/** The unconfirmed-value rule, exposed so tests can assert the site hides these. */
export function isPublishedSetting(setting: { isConfirmed?: boolean; value: unknown }): boolean {
  return Boolean(setting.isConfirmed) && setting.value !== null && setting.value !== "";
}
