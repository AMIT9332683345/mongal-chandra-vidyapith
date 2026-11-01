import { cache } from "react";
import type { Document } from "mongodb";
import {
  collectionRef,
  countDocs,
  findDoc,
  findDocById,
  findDocs,
  type DocOf,
  type FilterOf,
} from "@/server/db/mongo/repository";
import type { CollectionName } from "@/server/db/mongo/schema.generated";

/**
 * Read layer for the public website.
 *
 * Every query here is scoped to rows that are published and marked
 * publicly visible, and none of them read a private field. That is the
 * whole point of keeping the site data-driven: the school changes a row in
 * the admin interface and the page changes on the next request, without a
 * deployment and without a component holding an invented sentence.
 *
 * The relational version joined a category, a document or a designation onto
 * each row. Here those are separate keyed reads — `findDocs(col, { id: { $in } })`
 * hits the `_id` index for the small set of parent rows a page actually shows,
 * and the merge happens once in `attach` rather than in twenty SQL strings.
 */

/* -------------------------------------------------------------------------- */
/* Join helpers                                                                */
/* -------------------------------------------------------------------------- */

async function byIds<N extends CollectionName>(
  collection: N,
  ids: (string | undefined | null)[],
  filter: FilterOf<DocOf<N>> = {},
): Promise<Map<string, DocOf<N>>> {
  const unique = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (unique.length === 0) return new Map();
  const rows = await findDocs(collection, { id: { $in: unique }, ...filter } as FilterOf<DocOf<N>>);
  return new Map(rows.map((row) => [(row as { id: string }).id, row]));
}

/**
 * The ids of a public, live, non-deleted file row. A cover photograph that has
 * been withdrawn or was never publicly readable is dropped from the page rather
 * than rendered broken, so every listing asks the same question of the same set.
 */
async function readablePublicDocumentIds(ids: (string | undefined | null)[]): Promise<Set<string>> {
  const map = await byIds(
    "documents",
    ids,
    { status: "published", visibility: "public", deletedAt: null } as FilterOf<DocOf<"documents">>,
  );
  return new Set(map.keys());
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

/** Calendar day in the server's local zone, as the `date` columns store it. */
function today(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Case-insensitive substring match, with the pattern characters taken literally. */
function containsInsensitive(text: string): Document {
  return { $regex: text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

export type SettingsMap = Record<string, { value: unknown; label: string; confirmed: boolean }>;

/**
 * Confirmed, publicly readable settings only.
 *
 * An unconfirmed row is a gap in the school's information, not a value — the
 * pages render it as such instead of printing a placeholder as though it were
 * fact.
 */
export const getSettings = cache(async (): Promise<SettingsMap> => {
  const rows = await findDocs("school_settings", { publicReadable: true }, { sort: { group: 1, sortOrder: 1 } });

  const map: SettingsMap = {};
  for (const row of rows) {
    map[row.key] = { value: row.value, label: row.label, confirmed: row.isConfirmed ?? false };
  }
  return map;
});

/** A setting's text, or null when the school has not supplied it. */
export function settingText(settings: SettingsMap, key: string): string | null {
  const entry = settings[key];
  if (!entry || !entry.confirmed || entry.value === null || entry.value === undefined) return null;
  if (typeof entry.value === "string") return entry.value.trim() || null;
  if (typeof entry.value === "number" || typeof entry.value === "boolean") return String(entry.value);
  return null;
}

export const getSchoolName = cache(async (): Promise<string> => {
  const settings = await getSettings();
  return settingText(settings, "school.name") ?? "Mongal Chandra Vidyapith";
});

/* -------------------------------------------------------------------------- */
/* Notices                                                                     */
/* -------------------------------------------------------------------------- */

export type PublicNotice = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  referenceNumber: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  pinned: boolean;
  categoryName: string | null;
  categoryKey: string | null;
  /** Null when the notice has no category row at all. */
  isEmergency: boolean | null;
};

export type NoticeListFilter = {
  limit?: number;
  offset?: number;
  categoryKey?: string;
  search?: string;
  /** Keep expired items in the live board listing. */
  includeExpired?: boolean;
  /** Serve only items whose display period has closed — the archive. */
  expiredOnly?: boolean;
};

const LIVE_NOTICE_FILTER: FilterOf<DocOf<"notices">> = {
  status: "published",
  publicVisible: true,
  archivedAt: null,
};

/** Build the selection for the notice board, resolving a category key first. */
async function noticeFilter(filter: NoticeListFilter): Promise<FilterOf<DocOf<"notices">>> {
  const where: FilterOf<DocOf<"notices">> = { ...LIVE_NOTICE_FILTER };
  const day = today();

  if (filter.expiredOnly) where.expiresOn = { $lt: day };
  else if (!filter.includeExpired) where.$or = [{ expiresOn: null }, { expiresOn: { $gte: day } }];

  if (filter.categoryKey) {
    const category = await findDoc("notice_categories", { key: filter.categoryKey });
    // A key nobody publishes under matches nothing, rather than everything.
    if (!category) return { ...where, id: { $in: [] } };
    where.categoryId = category.id;
  }

  if (filter.search) {
    const matches = [
      { title: containsInsensitive(filter.search) },
      { summary: containsInsensitive(filter.search) },
    ];
    where.$and = [...(where.$and ?? []), { $or: matches }];
  }

  return where;
}

const NOTICE_SORT: Document = { pinned: -1, issuedOn: -1, publishedAt: -1 };

/** Attach the category columns a public notice listing shows. */
async function decorateNotices(rows: DocOf<"notices">[], includeBody: false): Promise<PublicNotice[]>;
async function decorateNotices(rows: DocOf<"notices">[], includeBody: true): Promise<(PublicNotice & { body: string })[]>;
async function decorateNotices(rows: DocOf<"notices">[], includeBody: boolean) {
  const categories = await byIds("notice_categories", rows.map((row) => row.categoryId));
  return rows.map((row) => {
    const category = row.categoryId ? categories.get(row.categoryId) : undefined;
    const notice: PublicNotice & { body?: string } = {
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary ?? null,
      referenceNumber: row.referenceNumber ?? null,
      issuedOn: row.issuedOn ?? null,
      expiresOn: row.expiresOn ?? null,
      pinned: row.pinned ?? false,
      categoryName: category?.name ?? null,
      categoryKey: category?.key ?? null,
      // Null when the notice has no category row at all.
      isEmergency: category ? (category.isEmergency ?? false) : null,
    };
    if (includeBody) notice.body = row.body;
    return notice;
  });
}

export async function listPublicNotices(filter: NoticeListFilter = {}): Promise<PublicNotice[]> {
  const rows = await findDocs("notices", await noticeFilter(filter), {
    sort: NOTICE_SORT,
    limit: Math.min(filter.limit ?? 20, 100),
    skip: Math.max(filter.offset ?? 0, 0),
  });
  return decorateNotices(rows, false);
}

/** Total matching rows, so the board can paginate instead of truncating silently. */
export async function countPublicNotices(filter: NoticeListFilter = {}): Promise<number> {
  return countDocs("notices", await noticeFilter(filter));
}

export async function listArchivedNotices(limit = 60): Promise<PublicNotice[]> {
  return listPublicNotices({ limit, expiredOnly: true });
}

export const getPublicNoticeBySlug = cache(
  async (slug: string): Promise<(PublicNotice & { body: string }) | null> => {
    const notice = await findDoc("notices", { ...LIVE_NOTICE_FILTER, slug });
    if (!notice) return null;
    const [attached] = await decorateNotices([notice], true);
    return attached ?? null;
  },
);

export async function listNoticeCategories() {
  const rows = await findDocs("notice_categories", { active: true }, { sort: { sortOrder: 1 } });
  return rows.map((row) => ({ key: row.key, name: row.name, description: row.description ?? null }));
}

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

const PUBLIC_EVENT_FILTER: FilterOf<DocOf<"events">> = {
  status: "published",
  publicVisible: true,
  archivedAt: null,
};

export type PublicEvent = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  venue: string | null;
  occurrenceState: string;
  featured: boolean;
  resultsSummary: string | null;
  categoryName: string | null;
  categoryKey: string | null;
  categoryGroup: string | null;
  seoDescription: string | null;
};

/** Stamp the category columns onto a set of event rows. */
async function decorateEvents(rows: DocOf<"events">[]): Promise<PublicEvent[]> {
  const categories = await byIds("event_categories", rows.map((row) => row.categoryId));
  return rows.map((row) => {
    const category = row.categoryId ? categories.get(row.categoryId) : undefined;
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary ?? null,
      startsAt: row.startsAt,
      endsAt: row.endsAt ?? null,
      allDay: row.allDay ?? false,
      venue: row.venue ?? null,
      occurrenceState: row.occurrenceState,
      featured: row.featured ?? false,
      resultsSummary: row.resultsSummary ?? null,
      categoryName: category?.name ?? null,
      categoryKey: category?.key ?? null,
      categoryGroup: category?.group ?? null,
      seoDescription: row.seoDescription ?? null,
    };
  });
}

/** Resolve the category filter, then the events; then stamp the category columns on. */
async function publicEvents(
  filter: FilterOf<DocOf<"events">>,
  categoryKey: string | undefined,
  sort: Document,
  limit: number,
): Promise<PublicEvent[]> {
  const rows = await eventRows(filter, categoryKey, sort, limit);
  return decorateEvents(rows);
}

async function eventRows(
  filter: FilterOf<DocOf<"events">>,
  categoryKey: string | undefined,
  sort: Document,
  limit: number,
): Promise<DocOf<"events">[]> {
  const where: FilterOf<DocOf<"events">> = { ...PUBLIC_EVENT_FILTER, ...filter };
  if (categoryKey) {
    const category = await findDoc("event_categories", { key: categoryKey });
    if (!category) return [];
    where.categoryId = category.id;
  }
  return findDocs("events", where, { sort, limit });
}

export async function listUpcomingEvents(limit = 6, categoryKey?: string) {
  return publicEvents({ startsAt: { $gte: new Date() } }, categoryKey, { startsAt: 1 }, Math.min(limit, 50));
}

export async function listPastEvents(limit = 12, categoryKey?: string) {
  return publicEvents({ startsAt: { $lte: new Date() } }, categoryKey, { startsAt: -1 }, Math.min(limit, 60));
}

/** Everything inside a calendar window; the month grid is built client-side from this. */
export async function listEventsInRange(from: Date, to: Date, categoryKey?: string) {
  return publicEvents({ startsAt: { $gte: from, $lte: to } }, categoryKey, { startsAt: 1 }, 0);
}

export const getPublicEventBySlug = cache(async (slug: string) => {
  const [row] = await eventRows({ slug }, undefined, { startsAt: 1 }, 1);
  if (!row) return null;
  const [event] = await decorateEvents([row]);
  if (!event) return null;
  return {
    ...event,
    description: row.description ?? null,
    venueAddress: row.venueAddress ?? null,
    organiserLabel: row.organiserLabel ?? null,
    registrationRequired: row.registrationRequired ?? false,
    participationInstructions: row.participationInstructions ?? null,
    publishedAt: row.publishedAt ?? null,
  };
});

export async function listEventCategories() {
  const rows = await findDocs("event_categories", { active: true }, { sort: { sortOrder: 1 } });
  return rows.map((row) => ({
    key: row.key,
    name: row.name,
    group: row.group ?? null,
    recurringAnnually: row.recurringAnnually ?? false,
  }));
}

/* -------------------------------------------------------------------------- */
/* Gallery                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Albums publish only once an administrator has cleared consent for every
 * identifiable pupil in them — the flag is written by the publish path, and
 * the public query refuses to serve an album without it.
 */
export async function listPublishedAlbums(limit = 12, categoryKey?: string) {
  const where: FilterOf<DocOf<"gallery_albums">> = { status: "published", consentCleared: true };
  if (categoryKey) {
    const category = await findDoc("gallery_categories", { key: categoryKey });
    if (!category) return [];
    where.categoryId = category.id;
  }
  const albums = await findDocs("gallery_albums", where, {
    sort: { publishedAt: -1 },
    limit: Math.min(limit, 48),
  });

  // One grouped count over the frames of these albums, instead of the correlated
  // sub-select the SQL version ran per row.
  const counts = new Map<string, number>();
  const ids = albums.map((album) => album.id);
  if (ids.length > 0) {
    const grouped = await collectionRef("gallery_items")
      .aggregate([{ $match: { albumId: { $in: ids } } }, { $group: { _id: "$albumId", total: { $sum: 1 } } }])
      .toArray();
    for (const row of grouped) counts.set(String(row._id), Number(row.total));
  }

  const categories = await byIds("gallery_categories", albums.map((album) => album.categoryId));
  const relatedEvents = await byIds("events", albums.map((album) => album.eventId));
  const readableCovers = await readablePublicDocumentIds(albums.map((album) => album.coverDocumentId));

  return albums.map((album) => ({
    id: album.id,
    slug: album.slug,
    title: album.title,
    description: album.description ?? null,
    publishedAt: album.publishedAt ?? null,
    categoryName: album.categoryId ? categories.get(album.categoryId)?.name ?? null : null,
    categoryId: album.categoryId ?? null,
    eventSlug: album.eventId ? relatedEvents.get(album.eventId)?.slug ?? null : null,
    eventTitle: album.eventId ? relatedEvents.get(album.eventId)?.title ?? null : null,
    // A cover is decorative, so it is dropped rather than rendered broken when
    // the file behind it is not publicly readable.
    coverDocumentId:
      album.coverDocumentId && readableCovers.has(album.coverDocumentId) ? album.coverDocumentId : null,
    // Counted in the database so the page never loads a full set of rows just
    // to print "12 photographs".
    photoCount: counts.get(album.id) ?? 0,
  }));
}

/**
 * The most recently published photographs, for the homepage preview.
 *
 * Only items belonging to a consent-cleared, published album are returned, so a
 * draft album cannot leak a frame through the homepage.
 */
export async function listRecentGalleryItems(limit = 8) {
  const albums = await findDocs(
    "gallery_albums",
    { status: "published", consentCleared: true },
    { sort: { publishedAt: -1 }, limit: 24 },
  );
  if (albums.length === 0) return [];

  const items = await findDocs(
    "gallery_items",
    { albumId: { $in: albums.map((album) => album.id) } },
    { sort: { albumId: 1, sortOrder: 1 } },
  );
  const byAlbum = new Map<string, typeof items>();
  for (const item of items) {
    const bucket = byAlbum.get(item.albumId) ?? [];
    bucket.push(item);
    byAlbum.set(item.albumId, bucket);
  }

  // The SQL ordering was album-first, frame-second: walking the albums in the
  // same order reproduces it without a cross-collection sort.
  const ordered: {
    id: string;
    documentId: string;
    caption: string | null;
    albumSlug: string;
    albumTitle: string;
  }[] = [];
  for (const album of albums) {
    for (const item of byAlbum.get(album.id) ?? []) {
      ordered.push({
        id: item.id,
        documentId: item.documentId,
        caption: item.caption ?? null,
        albumSlug: album.slug,
        albumTitle: album.title,
      });
    }
  }
  return ordered.slice(0, Math.min(limit, 24));
}

export type HeroSlide = {
  documentId: string;
  alt: string;
  title: string;
  caption: string | null;
  albumSlug: string;
  widthPx: number | null;
  heightPx: number | null;
};

/**
 * The frames the homepage slideshow cycles through.
 *
 * The slideshow is content, not decoration: an administrator chooses which
 * published albums appear by listing their slugs in `site.hero_albums`, and
 * until they do, the newest consent-cleared albums are used. Only photographs
 * that have already passed the gallery's consent and visibility gate can reach
 * the homepage, because a hero has the largest picture on the site and the
 * easiest way to publish a pupil without permission is to put one there.
 */
export async function listHeroSlides(limit = 6): Promise<HeroSlide[]> {
  const configured = settingText(await getSettings(), "site.hero_albums");
  const slugs = (configured ?? "")
    .split(/[,\n]/)
    .map((slug) => slug.trim())
    .filter((slug) => slug.length > 0)
    .slice(0, 12);

  const albums =
    slugs.length > 0
      ? await findDocs(
          "gallery_albums",
          { slug: { $in: slugs }, status: "published", consentCleared: true },
          { sort: { publishedAt: -1 }, limit: Math.min(slugs.length, 12) },
        )
      : await findDocs(
          "gallery_albums",
          { status: "published", consentCleared: true },
          { sort: { publishedAt: -1 }, limit: Math.min(limit, 12) },
        );
  if (albums.length === 0) return [];

  const items = await findDocs(
    "gallery_items",
    { albumId: { $in: albums.map((album) => album.id) } },
    { sort: { albumId: 1, sortOrder: 1 } },
  );
  const files = await byIds(
    "documents",
    items.map((item) => item.documentId),
    { status: "published", visibility: "public", deletedAt: null } as FilterOf<DocOf<"documents">>,
  );

  // One frame per album keeps a slideshow of six albums showing six different
  // places rather than six near-identical crops of one event.
  const usedAlbums = new Set<string>();
  const slides: HeroSlide[] = [];
  for (const item of items) {
    if (usedAlbums.has(item.albumId)) continue;
    const file = files.get(item.documentId);
    if (!file) continue;
    usedAlbums.add(item.albumId);
    const album = albums.find((candidate) => candidate.id === item.albumId);
    if (!album) continue;
    slides.push({
      documentId: item.documentId,
      alt: file.altText ?? item.caption ?? album.title,
      title: album.title,
      caption: item.caption ?? album.description ?? null,
      albumSlug: album.slug,
      widthPx: file.widthPx ?? null,
      heightPx: file.heightPx ?? null,
    });
    if (slides.length >= Math.min(Math.max(limit, 2), 12)) break;
  }
  return slides.filter((slide) => isHeroWorthy(slide));
}

/**
 * A slideshow is roughly 1400 pixels wide on a desktop. A photograph recorded at
 * less than two-thirds of that would be stretched into a blur, so it is left out
 * and the homepage shows its framed, native-size picture instead. Files whose
 * dimensions were never recorded are given the benefit of the doubt, because the
 * uploader of a campus photograph usually records them.
 */
function isHeroWorthy(slide: HeroSlide): boolean {
  if (slide.widthPx === null) return true;
  return slide.widthPx >= 900;
}

export const getPublishedAlbumBySlug = cache(async (slug: string) => {
  const album = await findDoc("gallery_albums", {
    slug,
    status: "published",
    consentCleared: true,
  });
  if (!album) return null;

  const categories = await byIds("gallery_categories", [album.categoryId]);
  const relatedEvents = await byIds("events", [album.eventId]);

  // Every frame is checked against the file row so an album cannot render a
  // photograph that was later withdrawn, deleted, or never marked publicly readable.
  const rawItems = await findDocs("gallery_items", { albumId: album.id }, { sort: { sortOrder: 1 } });
  const files = await byIds(
    "documents",
    rawItems.map((item) => item.documentId),
    { status: "published", visibility: "public", deletedAt: null } as FilterOf<DocOf<"documents">>,
  );

  const items = rawItems.flatMap((item) => {
    const file = files.get(item.documentId);
    if (!file) return [];
    return [
      {
        id: item.id,
        caption: item.caption ?? null,
        credit: item.credit ?? null,
        documentId: item.documentId,
        mimeType: file.mimeType,
        altText: file.altText ?? null,
        widthPx: file.widthPx ?? null,
        heightPx: file.heightPx ?? null,
      },
    ];
  });

  return {
    id: album.id,
    slug: album.slug,
    title: album.title,
    description: album.description ?? null,
    publishedAt: album.publishedAt ?? null,
    categoryName: album.categoryId ? categories.get(album.categoryId)?.name ?? null : null,
    eventSlug: album.eventId ? relatedEvents.get(album.eventId)?.slug ?? null : null,
    eventTitle: album.eventId ? relatedEvents.get(album.eventId)?.title ?? null : null,
    items,
  };
});

export async function listGalleryCategories() {
  const rows = await findDocs("gallery_categories", { active: true }, { sort: { sortOrder: 1 } });
  return rows.map((row) => ({ id: row.id, key: row.key, name: row.name }));
}

/* -------------------------------------------------------------------------- */
/* Facilities, history, achievements, FAQs                                     */
/* -------------------------------------------------------------------------- */

/** Unconfirmed facilities are withheld entirely — a claim of a room that does not exist. */
export async function listPublicFacilities() {
  const rows = await findDocs(
    "facilities",
    { confirmed: true, publicVisible: true },
    { sort: { sortOrder: 1 } },
  );
  const readable = await readablePublicDocumentIds(rows.map((row) => row.imageDocumentId));
  return rows.map((row) => ({
    name: row.name,
    slug: row.slug,
    summary: row.summary ?? null,
    description: row.description ?? null,
    group: row.group ?? null,
    detail: row.detail ?? null,
    imageDocumentId:
      row.imageDocumentId && readable.has(row.imageDocumentId) ? row.imageDocumentId : null,
  }));
}

export async function listPublicMilestones() {
  const rows = await findDocs(
    "milestones",
    { confirmed: true, publicVisible: true },
    { sort: { periodSortValue: 1, sortOrder: 1 } },
  );
  return rows.map((row) => ({
    periodLabel: row.periodLabel,
    title: row.title,
    description: row.description ?? null,
    kind: row.kind ?? null,
  }));
}

export async function listPublicAchievements(limit = 12) {
  const rows = await findDocs(
    "achievements",
    { confirmed: true, status: "published", studentId: null },
    { sort: { achievedOn: -1 }, limit: Math.min(limit, 60) },
  );
  return rows.map((row) => ({
    title: row.title,
    description: row.description ?? null,
    category: row.category ?? null,
    achievedOn: row.achievedOn ?? null,
    eventName: row.eventName ?? null,
    awardingBody: row.awardingBody ?? null,
  }));
}

/**
 * A testimonial is a person putting their name to a sentence, so it appears only
 * once consent has been recorded as well as publication. An unconsented quote is
 * withheld rather than shown anonymously.
 */
export async function listPublishedTestimonials(limit = 6) {
  const rows = await findDocs(
    "testimonials",
    { status: "published", consentRecorded: true },
    { sort: { sortOrder: 1, publishedAt: -1 }, limit: Math.min(limit, 24) },
  );
  const readable = await readablePublicDocumentIds(rows.map((row) => row.imageDocumentId));
  return rows.map((row) => ({
    id: row.id,
    quote: row.quote,
    authorName: row.authorName,
    authorRole: row.authorRole,
    authorDetail: row.authorDetail ?? null,
    imageDocumentId:
      row.imageDocumentId && readable.has(row.imageDocumentId) ? row.imageDocumentId : null,
  }));
}

export async function listPublishedFaqs(category?: string) {
  const where: FilterOf<DocOf<"faqs">> = { published: true, ...(category ? { category } : {}) };
  const rows = await findDocs("faqs", where, { sort: { sortOrder: 1 } });
  return rows.map((row) => ({ question: row.question, answer: row.answer, category: row.category ?? null }));
}

export async function listVisibleSocialLinks() {
  const rows = await findDocs("social_links", { visible: true }, { sort: { sortOrder: 1 } });
  return rows.map((row) => ({ platform: row.platform, url: row.url, label: row.label ?? null }));
}

/* -------------------------------------------------------------------------- */
/* Academic structure and staff directory                                       */
/* -------------------------------------------------------------------------- */

export const getCurrentAcademicYear = cache(async () => {
  const year = await findDoc("academic_years", { isCurrent: true });
  if (!year) return null;
  return {
    id: year.id,
    name: year.name,
    startDate: year.startDate,
    endDate: year.endDate,
    admissionOpenFrom: year.admissionOpenFrom ?? null,
    admissionOpenTo: year.admissionOpenTo ?? null,
    remarks: year.remarks ?? null,
  };
});

export async function listPublicHolidays(limit = 30) {
  const rows = await findDocs(
    "holidays",
    { status: "published", startDate: { $gte: today() } },
    { sort: { startDate: 1 }, limit: Math.min(limit, 60) },
  );
  return rows.map((row) => ({
    title: row.title,
    kind: row.kind ?? null,
    startDate: row.startDate,
    endDate: row.endDate ?? null,
    appliesToAllClasses: row.appliesToAllClasses ?? false,
    description: row.description ?? null,
    isEmergency: row.isEmergency ?? false,
  }));
}

/**
 * Downloads the world may see. Only `visibility = 'public'` rows are listed,
 * and the id — never the storage key — is what the link carries; the download
 * route re-checks visibility before streaming the bytes.
 */
export async function listPublicDocuments(category?: string) {
  const rows = await findDocs(
    "documents",
    {
      visibility: "public",
      status: "published",
      deletedAt: null,
      ...(category ? { category } : {}),
    },
    { sort: { createdAt: -1 }, limit: 40 },
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title ?? null,
    description: row.description ?? null,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    category: row.category ?? null,
  }));
}

/**
 * Circulars attached to a public notice. A restricted PDF stays unreachable
 * here even when it is attached to a published notice.
 */
export async function listNoticeAttachments(noticeId: string) {
  const links = await findDocs("notice_documents", { noticeId }, { sort: { sortOrder: 1 } });
  const files = await byIds(
    "documents",
    links.map((link) => link.documentId),
    { status: "published", visibility: "public", deletedAt: null } as FilterOf<DocOf<"documents">>,
  );
  return links.flatMap((link) => {
    const file = files.get(link.documentId);
    if (!file) return [];
    return [
      {
        id: file.id,
        title: file.title ?? null,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        label: link.label ?? null,
      },
    ];
  });
}

/**
 * Published examination windows only. Per-paper timetables, marks and report
 * cards stay inside the portal: a schedule is public information, a result is
 * not.
 */
export async function listPublishedExams() {
  const rows = await findDocs(
    "exams",
    { status: "published", startDate: { $gte: today() } },
    { sort: { startDate: 1 }, limit: 20 },
  );
  const types = await byIds("exam_types", rows.map((row) => row.examTypeId));
  const years = await byIds("academic_years", rows.map((row) => row.academicYearId));
  return rows.map((row) => ({
    name: row.name,
    startDate: row.startDate,
    endDate: row.endDate ?? null,
    instructions: row.instructions ?? null,
    examTypeName: types.get(row.examTypeId)?.name ?? null,
    academicYearName: years.get(row.academicYearId)?.name ?? null,
    publishedAt: row.resultsPublishedAt ?? null,
  }));
}

/**
 * The bell schedule belongs to an academic year and is configured per school;
 * `timetablePeriods` is read by the portal, not the public site.
 */
export async function listPublicClasses() {
  const rows = await findDocs("classes", { active: true }, { sort: { orderNo: 1 } });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    shortName: row.shortName ?? null,
    orderNo: row.orderNo,
    typicalAgeYears: row.typicalAgeYears ?? null,
    admissionOpen: row.admissionOpen ?? false,
    description: row.description ?? null,
  }));
}

export async function listClassSubjects(classId: string) {
  const links = await findDocs("class_subjects", { classId });
  const subjects = await byIds("subjects", links.map((link) => link.subjectId));
  return links
    .map((link) => {
      const subject = subjects.get(link.subjectId);
      if (!subject) return null;
      return {
        name: subject.name,
        group: subject.group ?? null,
        compulsory: link.compulsory ?? false,
        weeklyPeriods: link.weeklyPeriods ?? null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The published directory.
 *
 * `privatePhone` is never read. A work contact is published only for posts whose
 * visibility explicitly allows it, because a staff member's number is not the
 * school's to advertise.
 */
export async function listStaffDirectory() {
  const rows = await findDocs(
    "staff_members",
    { employmentStatus: "active" },
    { sort: { sortOrder: 1 } },
  );
  const designations = await byIds("designations", rows.map((row) => row.designationId));
  const departments = await byIds("departments", rows.map((row) => row.departmentId));

  // A post whose designation is explicitly not public takes its holder with it;
  // a member with no designation row, or one where the flag was never set, stays listed.
  const rank = new Map<string, number>();
  const visible = rows.filter((row) => {
    const designation = row.designationId ? designations.get(row.designationId) : undefined;
    if (designation?.publiclyVisible === false) return false;
    if (designation?.directoryRank !== undefined) rank.set(row.id, designation.directoryRank);
    return true;
  });

  const readable = await readablePublicDocumentIds(visible.map((row) => row.photoDocumentId));

  const entries = visible.map((row) => ({
    name: `${row.firstName} ${row.lastName}`.trim(),
    designation: row.designationId ? (designations.get(row.designationId)?.title ?? null) : null,
    department: row.departmentId ? (departments.get(row.departmentId)?.name ?? null) : null,
    qualifications:
      row.directoryVisibility === "full_profile" || row.directoryVisibility === "name_and_designation"
        ? (row.qualifications ?? null)
        : null,
    biography: row.directoryVisibility === "full_profile" ? (row.biography ?? null) : null,
    contact: row.directoryVisibility === "with_contact" ? (row.publishedContact ?? null) : null,
    photoDocumentId:
      row.photoDocumentId && readable.has(row.photoDocumentId) ? row.photoDocumentId : null,
    // Only used to reproduce the directory ordering; not published.
    rank: rank.get(row.id) ?? Number.MAX_SAFE_INTEGER,
    order: row.sortOrder ?? 0,
  }));

  return entries
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map(({ rank: _rank, order: _order, ...entry }) => entry);
}

/* -------------------------------------------------------------------------- */
/* Editable prose                                                              */
/* -------------------------------------------------------------------------- */

export const getContentPage = cache(async (slug: string) => {
  const page = await findDoc("content_pages", { slug, status: "published" });
  if (!page) return null;
  return {
    slug: page.slug,
    title: page.title,
    intro: page.intro ?? null,
    body: page.body ?? null,
    seoTitle: page.seoTitle ?? null,
    seoDescription: page.seoDescription ?? null,
    noIndex: page.noIndex,
    publishedAt: page.publishedAt ?? null,
  };
});

export async function listHomepageSections() {
  const rows = await findDocs("homepage_sections", { visible: true }, { sort: { sortOrder: 1 } });
  return rows.map((row) => ({
    sectionKey: row.sectionKey,
    heading: row.heading ?? null,
    subheading: row.subheading ?? null,
    body: row.body ?? null,
    ctaLabel: row.ctaLabel ?? null,
    ctaHref: row.ctaHref ?? null,
    variant: row.variant ?? null,
    metadata: row.metadata ?? null,
    sortOrder: row.sortOrder ?? 0,
  }));
}

/* -------------------------------------------------------------------------- */
/* Sitemap                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every public detail page that currently exists, with the moment its row last
 * changed.
 *
 * The sitemap is generated from the same visibility conditions the pages
 * themselves use, so an entry cannot be advertised for a notice, event or album
 * that would answer 404. Nothing under `/portal`, `/signin` or `/api` is ever
 * returned from here, and `robots.txt` refuses those paths as well.
 */
export async function listSitemapEntries() {
  const [noticeRows, eventRows, albumRows] = await Promise.all([
    findDocs("notices", LIVE_NOTICE_FILTER, { projection: { slug: 1, updatedAt: 1 } }),
    findDocs("events", PUBLIC_EVENT_FILTER, { projection: { slug: 1, updatedAt: 1 } }),
    findDocs(
      "gallery_albums",
      { status: "published", consentCleared: true },
      { projection: { slug: 1, updatedAt: 1 } },
    ),
  ]);

  return [
    ...noticeRows.map((row) => ({ path: `/notices/${row.slug}`, updatedAt: row.updatedAt })),
    ...eventRows.map((row) => ({ path: `/events/${row.slug}`, updatedAt: row.updatedAt })),
    ...albumRows.map((row) => ({ path: `/gallery/${row.slug}`, updatedAt: row.updatedAt })),
  ];
}
