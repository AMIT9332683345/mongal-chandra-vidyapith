import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { findDoc, insertDoc, insertMany, updateOneDoc } from "@/server/db/mongo/repository";
import {
  getContentPage,
  getSettings,
  listArchivedNotices,
  listPublicAchievements,
  listPublishedAlbums,
  listPublicDocuments,
  listPublicFacilities,
  listPublicMilestones,
  listPublicNotices,
  listStaffDirectory,
  settingText,
} from "@/server/content/site";
import { storeFile } from "@/server/storage/files";

/**
 * What the public read layer is allowed to return.
 *
 * Every page on the site is built from these queries, so a row this layer
 * withholds is a row no visitor can reach — regardless of what a component
 * renders. The tests below put a published row and its unpublished twin next to
 * each other and assert that only one of them comes back.
 */

const RUN = randomUUID().slice(0, 8);

const PDF = Buffer.from("%PDF-1.4\n%fixture\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF", "utf8");

function slug(prefix: string): string {
  return `${prefix}-${RUN}`;
}

async function publishNotice(fields: {
  prefix: string;
  status?: "published" | "draft" | "archived";
  publicVisible?: boolean;
  archived?: boolean;
  expiresOn?: string;
}) {
  const notice = await insertDoc("notices", {
    title: `Fixture notice ${fields.prefix}`,
    slug: slug(fields.prefix),
    body: "Fixture body text.",
    status: fields.status ?? "published",
    publicVisible: fields.publicVisible ?? true,
    publishedAt: fields.status === "draft" ? null : new Date(),
    archivedAt: fields.archived ? new Date() : null,
    expiresOn: fields.expiresOn ?? null,
  });
  return notice.slug;
}

describe("public notice board", () => {
  /**
   * A day on the board's own calendar. The backend compares `expiresOn` with the
   * server's *local* day, so a fixture built from `toISOString()` — which is UTC
   * — can name today rather than yesterday for a few hours after midnight local
   * time, and the expired notice would then still be on the board.
   */
  function localDay(offsetDays: number): string {
    const day = new Date();
    day.setDate(day.getDate() + offsetDays);
    const month = `${day.getMonth() + 1}`.padStart(2, "0");
    const date = `${day.getDate()}`.padStart(2, "0");
    return `${day.getFullYear()}-${month}-${date}`;
  }

  const todayish = localDay(-1);

  beforeAll(async () => {
    await publishNotice({ prefix: "live" });
    await publishNotice({ prefix: "draft", status: "draft" });
    await publishNotice({ prefix: "internal", publicVisible: false });
    await publishNotice({ prefix: "archived", archived: true });
    await publishNotice({ prefix: "expired", expiresOn: todayish });
  });

  it("lists a published public notice", async () => {
    const slugs = (await listPublicNotices({ limit: 100 })).map((notice) => notice.slug);
    expect(slugs).toContain(slug("live"));
  });

  it("withholds a draft, a portal-only notice and an archived one", async () => {
    const slugs = (await listPublicNotices({ limit: 100 })).map((notice) => notice.slug);
    expect(slugs).not.toContain(slug("draft"));
    expect(slugs).not.toContain(slug("internal"));
    expect(slugs).not.toContain(slug("archived"));
  });

  it("drops a notice whose display period has closed from the board, but keeps it in the archive", async () => {
    const board = (await listPublicNotices({ limit: 100 })).map((notice) => notice.slug);
    expect(board).not.toContain(slug("expired"));

    const archived = (await listArchivedNotices(100)).map((notice) => notice.slug);
    expect(archived).toContain(slug("expired"));
  });

  it("never selects a column that could disclose a portal audience", async () => {
    const [notice] = await listPublicNotices({ limit: 100 });
    expect(notice).toBeDefined();
    expect(Object.keys(notice!)).not.toContain("body");
    expect(Object.keys(notice!)).not.toContain("audienceRoleKeys");
    expect(Object.keys(notice!)).not.toContain("createdByUserId");
  });
});

describe("editable pages", () => {
  it("serves a published page and nothing for a draft", async () => {
    await insertDoc("content_pages", {
      slug: slug("published-page"),
      title: "Fixture published page",
      body: "Written by the school.",
      status: "published",
      publishedAt: new Date(),
    });
    await insertDoc("content_pages", {
      slug: slug("draft-page"),
      title: "Fixture draft page",
      body: "Not ready.",
      status: "draft",
    });

    const published = await getContentPage(slug("published-page"));
    expect(published?.title).toBe("Fixture published page");
    expect(await getContentPage(slug("draft-page"))).toBeNull();
  });
});

describe("confirmed facts only", () => {
  it("refuses to publish a facility the school has not confirmed", async () => {
    await insertMany("facilities", [
      { name: "Fixture working library", slug: slug("library"), group: "academic", confirmed: true },
      { name: "Fixture planned laboratory", slug: slug("lab"), group: "academic", confirmed: false },
    ]);

    const names = (await listPublicFacilities()).map((facility) => facility.name);
    expect(names).toContain("Fixture working library");
    expect(names).not.toContain("Fixture planned laboratory");
  });

  it("refuses to publish a milestone or an achievement that is not confirmed", async () => {
    await insertMany("milestones", [
      { periodLabel: "Fixture era", title: "Confirmed milestone", confirmed: true, publicVisible: true },
      { periodLabel: "Fixture era", title: "Unconfirmed milestone", confirmed: false, publicVisible: true },
    ]);
    await insertMany("achievements", [
      { title: "Confirmed fixture award", category: "academic", confirmed: true, status: "published" },
      { title: "Unconfirmed fixture award", category: "academic", confirmed: false, status: "published" },
      { title: "Draft fixture award", category: "academic", confirmed: true, status: "draft" },
    ]);

    expect((await listPublicMilestones()).map((row) => row.title)).toContain("Confirmed milestone");
    expect((await listPublicMilestones()).map((row) => row.title)).not.toContain("Unconfirmed milestone");

    const published = (await listPublicAchievements(50)).map((row) => row.title);
    expect(published).toContain("Confirmed fixture award");
    expect(published).not.toContain("Unconfirmed fixture award");
    expect(published).not.toContain("Draft fixture award");
  });

  it("withholds an unconfirmed setting and a portal-only setting, and shows a confirmed one", async () => {
    const unconfirmed = `test.${RUN}.address`;
    const confirmed = `test.${RUN}.phone`;
    const internal = `test.${RUN}.secret`;

    await insertMany("school_settings", [
      {
        key: unconfirmed,
        label: "Fixture address, not yet supplied",
        group: "contact",
        inputKind: "textarea",
        value: "A placeholder street",
        isConfirmed: false,
        publicReadable: true,
      },
      {
        key: confirmed,
        label: "Fixture office telephone",
        group: "contact",
        inputKind: "tel",
        value: "+00000000000",
        isConfirmed: true,
        publicReadable: true,
      },
      {
        key: internal,
        label: "Fixture internal setting",
        group: "general",
        inputKind: "text",
        value: "Never public",
        isConfirmed: true,
        publicReadable: false,
      },
    ]);

    const settings = await getSettings();
    expect(settingText(settings, unconfirmed)).toBeNull();
    expect(settingText(settings, confirmed)).toBe("+00000000000");
    expect(settingText(settings, internal)).toBeNull();
  });
});

describe("gallery consent", () => {
  it("withholds an album whose consent has not been verified", async () => {
    const consented = await storeFile({
      buffer: PDF,
      originalFilename: "consented.pdf",
      declaredMimeType: "application/pdf",
      kind: "gallery",
      visibility: "public",
    });
    const pending = await storeFile({
      buffer: PDF,
      originalFilename: "pending.pdf",
      declaredMimeType: "application/pdf",
      kind: "gallery",
      visibility: "public",
    });

    await insertMany("gallery_albums", [
      {
        title: "Fixture cleared album",
        slug: slug("cleared-album"),
        status: "published",
        consentCleared: true,
        publishedAt: new Date(),
      },
      {
        title: "Fixture album awaiting consent",
        slug: slug("pending-album"),
        status: "published",
        consentCleared: false,
        publishedAt: new Date(),
      },
    ]);

    const cleared = await findDoc("gallery_albums", { slug: slug("cleared-album") }, { projection: { id: 1 } });
    const uncleared = await findDoc("gallery_albums", { slug: slug("pending-album") }, { projection: { id: 1 } });
    if (!cleared || !uncleared) throw new Error("Fixture albums are not in the database.");

    await insertMany("gallery_items", [
      { albumId: cleared.id, documentId: consented.id, caption: "Cleared photograph" },
      {
        albumId: uncleared.id,
        documentId: pending.id,
        caption: "Photograph of identifiable pupils",
        containsIdentifiableMinors: true,
        consentStatus: "pending",
      },
    ]);

    const slugs = (await listPublishedAlbums(48)).map((album) => album.slug);
    expect(slugs).toContain(slug("cleared-album"));
    expect(slugs).not.toContain(slug("pending-album"));
  });

  it("drops a cover image whose file is not publicly readable", async () => {
    const privateCover = await storeFile({
      buffer: PDF,
      originalFilename: "private-cover.pdf",
      declaredMimeType: "application/pdf",
      kind: "gallery",
      visibility: "private",
    });

    await insertDoc("gallery_albums", {
      title: "Fixture album with a private cover",
      slug: slug("private-cover-album"),
      status: "published",
      consentCleared: true,
      publishedAt: new Date(),
      coverDocumentId: privateCover.id,
    });

    const album = (await listPublishedAlbums(48)).find((row) => row.slug === slug("private-cover-album"));
    expect(album).toBeDefined();
    expect(album!.coverDocumentId).toBeNull();
  });
});

describe("staff directory", () => {
  it("publishes a name and a post, but never a private telephone number", async () => {
    const designation = await insertDoc("designations", {
      title: `Fixture teacher ${RUN}`,
      publiclyVisible: true,
    });

    const portrait = await storeFile({
      buffer: PDF,
      originalFilename: "portrait.pdf",
      declaredMimeType: "application/pdf",
      kind: "staff_portrait",
      visibility: "public",
    });

    await insertMany("staff_members", [
      {
        firstName: "Fixture",
        lastName: "Visible",
        employeeCode: `FIX-${RUN}-V`,
        designationId: designation.id,
        employmentStatus: "active",
        directoryVisibility: "full_profile",
        privatePhone: "+000011112222",
        biography: "Fixture biography.",
        photoDocumentId: portrait.id,
      },
      {
        firstName: "Fixture",
        lastName: "Hidden",
        employeeCode: `FIX-${RUN}-H`,
        designationId: designation.id,
        employmentStatus: "inactive",
        directoryVisibility: "full_profile",
        privatePhone: "+000033334444",
      },
    ]);

    const directory = await listStaffDirectory();
    const visible = directory.find((row) => row.name === "Fixture Visible");
    expect(visible).toBeDefined();
    expect(visible!.photoDocumentId).toBe(portrait.id);

    expect(directory.map((row) => row.name)).not.toContain("Fixture Hidden");

    // The column is not merely blank — it is never read.
    for (const row of directory) {
      expect(Object.keys(row)).not.toContain("privatePhone");
    }
  });
});

describe("document library", () => {
  it("lists public circulars and hides restricted proof and deleted files", async () => {
    const publicDoc = await storeFile({
      buffer: PDF,
      originalFilename: "public-circular.pdf",
      declaredMimeType: "application/pdf",
      kind: "circular",
      category: "admission",
      title: "Fixture public circular",
      visibility: "public",
    });
    const restricted = await storeFile({
      buffer: PDF,
      originalFilename: "restricted-proof.pdf",
      declaredMimeType: "application/pdf",
      kind: "admission_proof",
      category: "admission",
      title: "Fixture restricted proof",
      visibility: "restricted",
    });
    const deleted = await storeFile({
      buffer: PDF,
      originalFilename: "withdrawn.pdf",
      declaredMimeType: "application/pdf",
      kind: "circular",
      category: "admission",
      title: "Fixture withdrawn circular",
      visibility: "public",
    });
    await updateOneDoc("documents", { id: deleted.id }, { deletedAt: new Date() });

    const listed = await listPublicDocuments("admission");
    const ids = listed.map((row) => row.id);
    expect(ids).toContain(publicDoc.id);
    expect(ids).not.toContain(restricted.id);
    expect(ids).not.toContain(deleted.id);

    // The storage key never leaves the server, so a link cannot be built by hand.
    for (const row of listed) {
      expect(Object.keys(row)).not.toContain("storageKey");
    }
  });
});
