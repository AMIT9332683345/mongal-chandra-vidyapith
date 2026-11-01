import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { findDoc, findDocById, insertDoc, updateOneDoc } from "@/server/db/mongo/repository";
import { loadGrants, makeCsrfToken, type Principal } from "@/server/auth/session";
import {
  addNoticeAttachments,
  getAlbumForAdmin,
  listNoticeAttachmentsForAdmin,
  releaseDueNotices,
} from "@/server/content/admin";
import {
  settingsDraftFrom,
  removeEvent,
  removeNotice,
  writeAlbum,
  writeAlbumPhotos,
  writeAlbumPublish,
  writeEvent,
  writeHeroAlbums,
  writeHomepageSection,
  writeHomepageSectionVisibility,
  writeNotice,
  writeNoticeAttachmentRemove,
  writeNoticeAttachments,
  writeNoticeStatus,
  writePhotoConsent,
  writeSettings,
} from "@/server/content/writes";
import { listHomepageSections, listHeroSlides, listPublicNotices } from "@/server/content/site";
import { createAccount } from "./fixtures";
import { serveStoredFile } from "@/server/http/file-response";

/**
 * The content panel's own rules, tested against the real database.
 *
 * The panel is where a school puts its name on things, so the things worth
 * proving are the ones a careless or malicious submission could get wrong: that a
 * form without this session's token writes nothing, that a notice, an event and an
 * album each stay invisible until the publish step, that a photograph of a pupil
 * cannot reach the public file route before its consent is recorded, and that a
 * blank block cannot be shown on the homepage just because someone pressed the
 * button.
 *
 * Permissions themselves are checked one layer above, in `actions.ts`, by the same
 * `requirePermission` the auth suite covers. What is tested here is everything
 * that layer hands down.
 */

const SESSION = `cms-test-${randomUUID().slice(0, 8)}`;

let actor: Principal;

/** A real WebP so the dimension probe has something honest to read. */
const PHOTO = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20, 0x04, 0x00, 0x00,
  0x00, 0x30, 0x81, 0x08, 0x00,
]);
const PDF = Buffer.from("%PDF-1.4\n%fixture\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF", "utf8");

let counter = 0;

/** A form as the panel sends it: this session's token plus the fields. */
function form(fields: Record<string, string | number | Buffer | undefined>): FormData {
  const formData = new FormData();
  formData.set("csrfToken", makeCsrfToken(SESSION));
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (Buffer.isBuffer(value)) {
      counter += 1;
      formData.append(name, new File([new Uint8Array(value)], `fixture-${counter}.webp`, { type: "image/webp" }));
      continue;
    }
    formData.set(name, String(value));
  }
  return formData;
}

function fileForm(name: string, mime: string, bytes: Buffer, fields: Record<string, string> = {}): FormData {
  counter += 1;
  const formData = new FormData();
  formData.set("csrfToken", makeCsrfToken(SESSION));
  formData.append(name, new File([new Uint8Array(bytes)], `fixture-${counter}`, { type: mime }));
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

async function draftNotice(title = `Fixture notice ${randomUUID().slice(0, 8)}`) {
  const result = await writeNotice(actor, form({ title, body: "Fixture body written by the panel test." }));
  if (!result.ok || !result.createdId) throw new Error(`Fixture notice could not be drafted: ${result.message}`);
  return { id: result.createdId, title };
}

async function albumWithOnePhoto(title = `Fixture album ${randomUUID().slice(0, 8)}`) {
  const saved = await writeAlbum(actor, form({ title }));
  if (!saved.ok || !saved.createdId) throw new Error(`Fixture album could not be created: ${saved.message}`);
  const upload = await writeAlbumPhotos(
    actor,
    fileForm("photos", "image/webp", PHOTO, { id: saved.createdId, containsIdentifiableMinors: "on", altText: "Fixture alt text" }),
  );
  if (!upload.ok) throw new Error(`Fixture photograph could not be uploaded: ${upload.message}`);
  const album = await getAlbumForAdmin(saved.createdId);
  if (!album || album.items.length === 0) throw new Error("Fixture album has no frame.");
  return { albumId: saved.createdId, title, item: album.items[0] };
}

beforeAll(async () => {
  // A real account row, because the trail names the person who acted and a
  // fabricated id would make every one of these audit rows a lie.
  const account = await createAccount("school_admin", "cms-editor");
  const grants = await loadGrants(account.userId);
  actor = {
    userId: account.userId,
    email: account.email,
    displayName: "Fixture Editor",
    mustChangePassword: false,
    sessionId: SESSION,
    roleKeys: grants.roleKeys,
    grants: grants.grants,
  };
});

describe("the token on the form", () => {
  it("writes nothing when the session's token is missing", async () => {
    const formData = new FormData();
    formData.set("title", "A notice that must not exist");
    formData.set("body", "and its text");
    const result = await writeNotice(actor, formData);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/security token/);
    expect(await findDoc("notices", { title: "A notice that must not exist" })).toBeNull();
  });

  it("writes nothing when the token belongs to a different session", async () => {
    const formData = form({ title: "Replayed notice", body: "text" });
    formData.set("csrfToken", makeCsrfToken("some-other-session"));
    const result = await writeNotice(actor, formData);
    expect(result.ok).toBe(false);
    expect(await findDoc("notices", { title: "Replayed notice" })).toBeNull();
  });

  it("reads the honeypot field as an automated submission", async () => {
    const formData = form({ title: "Bot notice", body: "text", website: "http://bot.example" });
    const result = await writeNotice(actor, formData);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/automated/i);
  });
});

describe("a notice's way onto the board", () => {
  it("stays off the public board until the publish step", async () => {
    const { id, title } = await draftNotice();
    expect((await listPublicNotices({ limit: 200 })).some((row) => row.title === title)).toBe(false);

    const published = await writeNoticeStatus(actor, form({ id, intent: "publish" }));
    expect(published.ok).toBe(true);
    expect((await listPublicNotices({ limit: 200 })).some((row) => row.title === title)).toBe(true);

    const taken = await writeNoticeStatus(actor, form({ id, intent: "unpublish" }));
    expect(taken.ok).toBe(true);
    expect((await listPublicNotices({ limit: 200 })).some((row) => row.title === title)).toBe(false);
  });

  it("refuses to publish a notice with no text in it", async () => {
    const blank = await insertDoc("notices", {
      title: "Blank fixture notice",
      slug: `blank-${randomUUID().slice(0, 8)}`,
      body: "   ",
      status: "draft",
    });
    const result = await writeNoticeStatus(actor, form({ id: blank.id, intent: "publish" }));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/title and text/);
    expect((await findDocById("notices", blank.id))?.status).toBe("draft");
  });

  it("schedules for a time in the future and releases nothing before it", async () => {
    const { id, title } = await draftNotice();
    const past = await writeNoticeStatus(actor, form({ id, intent: "schedule", publishAt: "2020-01-01T09:00" }));
    expect(past.ok).toBe(false);
    expect(past.message).toMatch(/in the future/);

    const soon = new Date(Date.now() + 5 * 60_000);
    const pad = (n: number) => `${n}`.padStart(2, "0");
    const asLocalInput = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}T${pad(soon.getHours())}:${pad(soon.getMinutes())}`;
    const scheduled = await writeNoticeStatus(actor, form({ id, intent: "schedule", publishAt: asLocalInput }));
    expect(scheduled.ok).toBe(true);
    expect(await releaseDueNotices(actor)).toBe(0);

    // The scheduler has no worker in this build, so the release step is a button.
    // Bring the stored time forward to the moment it would have fired.
    await updateOneDoc("notices", { id }, { publishAt: new Date(Date.now() - 1_000) });
    const released = await releaseDueNotices(actor);
    expect(released).toBeGreaterThan(0);
    expect((await listPublicNotices({ limit: 200 })).some((row) => row.title === title)).toBe(true);
  });

  it("will not delete without the confirmation box", async () => {
    const { id } = await draftNotice();
    const unconfirmed = await removeNotice(actor, form({ id }));
    expect(unconfirmed.ok).toBe(false);
    expect(await findDocById("notices", id)).not.toBeNull();

    const confirmed = await removeNotice(actor, form({ id, confirm: "true" }));
    expect(confirmed.ok).toBe(true);
    expect(await findDocById("notices", id)).toBeNull();
  });

  it("reports a validation failure as the field that caused it", async () => {
    const result = await writeNotice(actor, form({ title: "no", body: "text" }));
    expect(result.ok).toBe(false);
    expect(Object.keys(result.errors ?? {})).toContain("title");
  });
});

describe("an event's way onto the calendar", () => {
  it("saves a draft and will not delete without confirmation", async () => {
    const title = `Fixture event ${randomUUID().slice(0, 8)}`;
    const saved = await writeEvent(actor, form({ title, startsAt: "2030-04-01T10:00", summary: "Fixture" }));
    expect(saved.ok).toBe(true);
    const id = saved.createdId!;

    const unconfirmed = await removeEvent(actor, form({ id }));
    expect(unconfirmed.ok).toBe(false);
    expect(await findDocById("events", id)).not.toBeNull();

    const confirmed = await removeEvent(actor, form({ id, confirm: "true" }));
    expect(confirmed.ok).toBe(true);
    expect(await findDocById("events", id)).toBeNull();
  });

  it("refuses a start time that is not a date and time", async () => {
    const result = await writeEvent(actor, form({ title: "Fixture event", startsAt: "next tuesday" }));
    expect(result.ok).toBe(false);
    expect(await findDoc("events", { title: "Fixture event" })).toBeNull();
  });
});

describe("consent stands between a photograph and the public", () => {
  it("refuses to publish an album whose frame shows a pupil with no answer recorded", async () => {
    const { albumId, item } = await albumWithOnePhoto();

    const refused = await writeAlbumPublish(actor, form({ id: albumId, intent: "publish" }));
    expect(refused.ok).toBe(false);
    expect(refused.message).toMatch(/without recorded consent/);

    // The frame is held back from the public file route while it waits.
    const beforePublish = await serveStoredFile(item.documentId, "inline");
    expect(beforePublish.status).toBe(404);

    const granted = await writePhotoConsent(actor, form({ id: item.id, consentStatus: "granted" }));
    expect(granted.ok).toBe(true);

    const published = await writeAlbumPublish(actor, form({ id: albumId, intent: "publish" }));
    expect(published.ok).toBe(true);

    const afterPublish = await serveStoredFile(item.documentId, "inline");
    expect(afterPublish.status).toBe(200);
    expect(afterPublish.headers.get("Content-Type")).toBe("image/webp");
  });

  it("will not publish an empty album", async () => {
    const saved = await writeAlbum(actor, form({ title: `Empty fixture album ${randomUUID().slice(0, 8)}` }));
    const result = await writeAlbumPublish(actor, form({ id: saved.createdId!, intent: "publish" }));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/no photographs/);
  });

  it("takes a published album back down when a consent is withdrawn", async () => {
    const { albumId, item } = await albumWithOnePhoto();
    await writePhotoConsent(actor, form({ id: item.id, consentStatus: "granted" }));
    expect((await writeAlbumPublish(actor, form({ id: albumId, intent: "publish" }))).ok).toBe(true);

    const withdrew = await writePhotoConsent(actor, form({ id: item.id, consentStatus: "withdrawn" }));
    expect(withdrew.ok).toBe(true);

    const album = await findDocById("gallery_albums", albumId);
    expect(album?.status).toBe("draft");
    expect(album?.consentCleared).toBe(false);
    // With the album unpublished, its bytes are no longer fetchable by anyone.
    expect((await serveStoredFile(item.documentId, "inline")).status).toBe(404);

    // And a withdrawn frame blocks a fresh publication until it is removed.
    const republish = await writeAlbumPublish(actor, form({ id: albumId, intent: "publish" }));
    expect(republish.ok).toBe(false);
    expect(republish.message).toMatch(/withdrawn/);
  });

  it("refuses a consent value that is not one of the four", async () => {
    const { item } = await albumWithOnePhoto();
    const result = await writePhotoConsent(actor, form({ id: item.id, consentStatus: "probably" }));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/four consent states/);
  });

  it("refuses a file that is not an image", async () => {
    const saved = await writeAlbum(actor, form({ title: `Bad upload album ${randomUUID().slice(0, 8)}` }));
    const result = await writeAlbumPhotos(
      actor,
      fileForm("photos", "image/webp", Buffer.from("#!/bin/sh\n", "utf8"), { id: saved.createdId!, containsIdentifiableMinors: "on" }),
    );
    // The album itself is fine, so the write succeeds — with nothing in it and the
    // reason said out loud rather than a silent zero.
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/None of those files/);
    const album = await getAlbumForAdmin(saved.createdId!);
    expect(album?.items).toHaveLength(0);
  });
});

describe("a circular's attachments follow the notice", () => {
  it("stays out of the download route until the notice publishes", async () => {
    const { id } = await draftNotice();
    const attached = await writeNoticeAttachments(
      actor,
      fileForm("attachments", "application/pdf", PDF, { id, label: "Fixture order" }),
    );
    expect(attached.ok).toBe(true);

    const asDraft = await listNoticeAttachmentsForAdmin(id);
    expect(asDraft).toHaveLength(1);
    expect(asDraft[0].downloadable).toBe(false);
    expect((await serveStoredFile(asDraft[0].documentId, "attachment")).status).toBe(404);

    expect((await writeNoticeStatus(actor, form({ id, intent: "publish" }))).ok).toBe(true);
    const asPublished = await listNoticeAttachmentsForAdmin(id);
    expect(asPublished[0].downloadable).toBe(true);
    expect((await serveStoredFile(asPublished[0].documentId, "attachment")).status).toBe(200);

    // Taking the notice down locks the file again rather than leaving it public.
    expect((await writeNoticeStatus(actor, form({ id, intent: "unpublish" }))).ok).toBe(true);
    expect((await serveStoredFile(asPublished[0].documentId, "attachment")).status).toBe(404);

    const detached = await writeNoticeAttachmentRemove(
      actor,
      form({ id, file: asPublished[0].documentId, confirm: "true" }),
    );
    expect(detached.ok).toBe(true);
    expect(await listNoticeAttachmentsForAdmin(id)).toHaveLength(0);
  });

  it("refuses to attach nothing", async () => {
    const { id } = await draftNotice();
    const result = await writeNoticeAttachments(actor, form({ id }));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/at least one/);
  });

  it("rejects a file whose declared type is a lie", async () => {
    const { id } = await draftNotice();
    const result = await writeNoticeAttachments(
      actor,
      fileForm("attachments", "application/pdf", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]), { id }),
    );
    // Declared as PDF, the bytes are JPEG: nothing is filed, and the form says so.
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/None of those files/);
    expect(await listNoticeAttachmentsForAdmin(id)).toHaveLength(0);
  });
});

describe("the homepage", () => {
  it("keeps a live block live while its words are corrected", async () => {
    const sectionKey = `fixture-live-${randomUUID().slice(0, 8)}`;
    await insertDoc("homepage_sections", {
      sectionKey,
      heading: "Fixture block",
      body: "Written before the correction.",
      sortOrder: 900,
      visible: true,
    });

    const saved = await writeHomepageSection(
      actor,
      form({ id: sectionKey, heading: "Fixture block", body: "Corrected after it went live.", ctaLabel: "", ctaHref: "" }),
    );
    expect(saved.ok).toBe(true);
    const afterSave = await findDoc("homepage_sections", { sectionKey });
    expect(afterSave?.visible).toBe(true);
    expect(afterSave?.body).toBe("Corrected after it went live.");

    const hidden = await writeHomepageSectionVisibility(actor, form({ id: sectionKey }));
    expect(hidden.ok).toBe(true);
    expect((await listHomepageSections()).some((row) => row.sectionKey === sectionKey)).toBe(false);
  });

  it("will not show a block that has nothing in it", async () => {
    const sectionKey = `fixture-empty-${randomUUID().slice(0, 8)}`;
    await insertDoc("homepage_sections", { sectionKey, heading: "", body: "", sortOrder: 901, visible: false });

    const result = await writeHomepageSectionVisibility(actor, form({ id: sectionKey, show: "on" }));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/empty block/i);
    expect((await findDoc("homepage_sections", { sectionKey }))?.visible).toBe(false);
  });

  it("refuses a button that points anywhere but this site or https", async () => {
    const section = await findDoc("homepage_sections", {}, { sort: { sortOrder: 1 } });
    const result = await writeHomepageSection(
      actor,
      form({ id: section!.sectionKey, heading: section!.heading ?? "x", body: section!.body ?? "y", ctaHref: "javascript:alert(1)" }),
    );
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not an address a button/);
  });

  it("only lets a published, consent-cleared album become a slideshow frame", async () => {
    const draft = await writeAlbum(actor, form({ title: `Draft hero album ${randomUUID().slice(0, 8)}` }));
    const refused = await writeHeroAlbums(actor, form({ [`hero.${(await findDocById("gallery_albums", draft.createdId!))!.slug}`]: "on" }));
    expect(refused.ok).toBe(true);
    expect(refused.message).toMatch(/could not be used/);

    const publishedAlbum = await albumWithOnePhoto(`Hero fixture album ${randomUUID().slice(0, 8)}`);
    await writePhotoConsent(actor, form({ id: publishedAlbum.item.id, consentStatus: "granted" }));
    expect((await writeAlbumPublish(actor, form({ id: publishedAlbum.albumId, intent: "publish" }))).ok).toBe(true);
    const albumRow = await findDocById("gallery_albums", publishedAlbum.albumId);

    const chosen = await writeHeroAlbums(actor, form({ [`hero.${albumRow!.slug}`]: "on" }));
    expect(chosen.ok).toBe(true);
    expect(chosen.message).toMatch(/cycles through 1 album/);

    const slides = await listHeroSlides(6);
    expect(slides.length).toBeGreaterThan(0);
    expect([...new Set(slides.map((slide) => slide.albumSlug))]).toEqual([albumRow!.slug]);
  });

  it("turns the slideshow off when nothing is ticked", async () => {
    const result = await writeHeroAlbums(actor, form({ unrelated: "x" }));
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/turned off/);
    const setting = await findDoc("school_settings", { key: "site.hero_albums" });
    expect(setting?.value).toBe("none");
    expect(setting?.isConfirmed).toBe(true);
  });
});

describe("school details are two facts", () => {
  const key = "school.phone";

  it("stores an answer that is not yet published", async () => {
    const result = await writeSettings(actor, form({ [`set.${key}`]: "+00000000001" }));
    expect(result.ok).toBe(true);
    const row = await findDoc("school_settings", { key });
    expect(row?.value).toBe("+00000000001");
    expect(row?.isConfirmed).toBe(false);
  });

  it("publishes the same answer only when its box is ticked", async () => {
    const result = await writeSettings(actor, form({ [`set.${key}`]: "+00000000001", [`ok.${key}`]: "on" }));
    expect(result.ok).toBe(true);
    const row = await findDoc("school_settings", { key });
    expect(row?.isConfirmed).toBe(true);
  });

  it("counts a resubmission that changed nothing as nothing changed", async () => {
    const result = await writeSettings(actor, form({ [`set.${key}`]: "+00000000001", [`ok.${key}`]: "on" }));
    expect(result.message).toMatch(/Nothing changed/);
  });

  it("reads only the ticked boxes as confirmations", () => {
    const formData = new FormData();
    formData.set("set.school.email", "office@example.invalid");
    formData.set("ok.school.email", "on");
    formData.set("ok.school.name", "on");
    formData.set("set.school.name", "Mongal Chandra Vidyapith");
    expect(settingsDraftFrom(formData)).toEqual({
      values: { "school.email": "office@example.invalid", "school.name": "Mongal Chandra Vidyapith" },
      confirmed: ["school.email", "school.name"],
    });
  });

  it("leaves a row untouched when the form never named it", async () => {
    const before = await findDoc("school_settings", { key: "school.email" });
    await writeSettings(actor, form({ "set.school.tagline": "Fixture tagline" }));
    const after = await findDoc("school_settings", { key: "school.email" });
    expect(after?.value).toBe(before?.value ?? null);
  });
});

describe("what the trail records", () => {
  it("writes one line per accepted change, with the person who made it", async () => {
    const { id } = await draftNotice();
    await writeNoticeStatus(actor, form({ id, intent: "publish" }));
    const entry = await findDoc("audit_logs", { resourceId: id, action: "notice.publish" });
    expect(entry?.actorUserId).toBe(actor.userId);
    expect(entry?.summary).toBeTruthy();
  });

  it("writes nothing for a form the panel refused", async () => {
    const before = await findDoc("audit_logs", { action: "notice.publish", resourceId: "no-such-notice" });
    expect(before).toBeNull();
    await writeNoticeStatus(actor, form({ id: "no-such-notice", intent: "publish" }));
    expect(await findDoc("audit_logs", { action: "notice.publish", resourceId: "no-such-notice" })).toBeNull();
  });
});

describe("a file the panel accepted", () => {
  it("records the picture's own pixel size rather than trusting the name", async () => {
    expect(typeof addNoticeAttachments).toBe("function");
    const { id } = await draftNotice();
    // The real campus photograph: the probe must read 228×190 from its bytes.
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const bytes = await readFile(join(process.cwd(), "public", "images", "campus.webp"));
    const result = await writeNoticeAttachments(actor, fileForm("attachments", "image/webp", bytes, { id }));
    expect(result.ok).toBe(true);
    const [attachment] = await listNoticeAttachmentsForAdmin(id);
    const row = await findDocById("documents", attachment.documentId);
    expect(row?.widthPx).toBe(228);
    expect(row?.heightPx).toBe(190);
  });
});
