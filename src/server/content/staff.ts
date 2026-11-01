import { findDocs } from "@/server/db/mongo/repository";

/**
 * The notices a signed-in member of staff is meant to read.
 *
 * The public notice board only ever queries `publicVisible: true`; this is the
 * other half. A notice written for staff is published — it exists and is final —
 * but it is never public, and this query is what makes it reach its audience.
 *
 * The role list comes from the session that the server resolved, never from the
 * browser, so asking for a teacher notice as a pupil returns nothing.
 */

export type StaffNotice = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body: string;
  pinned: boolean;
  publishedAt: Date | null;
  expiresOn: string | null;
  categoryName: string | null;
  audienceRoleKeys: string[];
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function listNoticesForStaff(roleKeys: string[]): Promise<StaffNotice[]> {
  if (roleKeys.length === 0) return [];

  const rows = await findDocs(
    "notices",
    {
      status: "published",
      archivedAt: null,
      audienceRoleKeys: { $in: roleKeys },
      $or: [
        { expiresOn: null },
        { expiresOn: { $exists: false } },
        { expiresOn: { $gte: todayIso() } },
      ],
    },
    { sort: { pinned: -1, publishedAt: -1 }, limit: 50 },
  );

  const categoryIds = [...new Set(rows.map((row) => row.categoryId).filter((id): id is string => typeof id === "string"))];
  const categories =
    categoryIds.length > 0 ? await findDocs("notice_categories", { id: { $in: categoryIds } }) : [];
  const categoryById = new Map(categories.map((category) => [category.id, category.name]));

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? null,
    body: row.body,
    pinned: row.pinned ?? false,
    publishedAt: row.publishedAt ?? null,
    expiresOn: row.expiresOn ?? null,
    categoryName: row.categoryId ? categoryById.get(row.categoryId) ?? null : null,
    audienceRoleKeys: Array.isArray(row.audienceRoleKeys)
      ? row.audienceRoleKeys.filter((key): key is string => typeof key === "string")
      : [],
  }));
}
