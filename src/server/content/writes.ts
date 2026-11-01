import { z } from "zod";
import { actionError, actionOk, type ActionState } from "@/lib/action-state";
import { formChecked, formString } from "@/lib/form-values";
import {
  addAlbumPhotos,
  addNoticeAttachments,
  ContentRejectedError,
  deleteEvent,
  deleteNotice,
  getAlbumForAdmin,
  publishAlbum,
  releaseDueNotices,
  removeAlbumPhoto,
  removeNoticeAttachment,
  saveAlbum,
  saveEvent,
  saveHomepageSection,
  setHomepageSectionVisibility,
  saveNotice,
  saveSettings,
  setAlbumCover,
  setEventStatus,
  setHeroAlbums,
  setNoticeStatus,
  setPhotoCaption,
  setPhotoConsent,
  unpublishAlbum,
  type NoticeAction,
} from "@/server/content/admin";
import {
  AuthenticationError,
  AuthorizationError,
  constantTimeEquals,
  makeCsrfToken,
  type Principal,
} from "@/server/auth/session";

/**
 * The request side of the content panel.
 *
 * A Server Action hands the browser's FormData to one of these functions. What
 * happens here, in order: the session's CSRF token is checked, the form is
 * mapped onto a validated shape, the write is attempted, and the outcome is
 * turned into a sentence. Permissions are checked one layer above, in
 * `actions.ts`, before any of this runs — and nothing here assumes that happened
 * politely: every write it performs still carries the actor's identity into the
 * audit trail.
 */

/* -------------------------------------------------------------------------- */
/* Shared guards                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The token that was rendered into this page for this session.
 *
 * Next rejects a cross-origin Server Action on its own, but the check here is
 * independent of the framework: a forged submission from another site would have
 * to reproduce a value derived from the server secret and bound to the sender's
 * own session row.
 */
function assertFormCsrf(actor: Principal, formData: FormData): void {
  const supplied = formString(formData, "csrfToken");
  if (!supplied || !constantTimeEquals(supplied, makeCsrfToken(actor.sessionId))) {
    throw new AuthorizationError("The security token on this form has expired. Reload the page and try again.");
  }
}

/** The fields a honeypot would fill in, which a staff form does not need. */
function assertNotAutomated(formData: FormData): void {
  if (formString(formData, "website") !== null) {
    throw new ContentRejectedError("This submission was rejected as automated.");
  }
}

/** Zod's report, flattened to one sentence per field. */
function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/** One text field, trimmed; an empty box is null rather than the empty string. */
function text(formData: FormData, name: string): string | null {
  return formString(formData, name);
}

function requiredId(formData: FormData, label: string): string {
  return requiredField(formData, "id", label);
}

function requiredField(formData: FormData, field: string, label: string): string {
  const value = formString(formData, field);
  if (!value) throw new ContentRejectedError(`No ${label} was named in this form.`);
  return value;
}

/** Runs one write and turns any of the four failure shapes into a message. */
async function attempt(
  actor: Principal,
  formData: FormData,
  work: () => Promise<ActionState>,
): Promise<ActionState> {
  try {
    assertFormCsrf(actor, formData);
    assertNotAutomated(formData);
    return await work();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return actionError("Your session has ended. Sign in again to continue.");
    }
    if (error instanceof AuthorizationError) {
      return actionError(error.message);
    }
    if (error instanceof ContentRejectedError) {
      return actionError(error.message);
    }
    if (error instanceof z.ZodError) {
      const errors = fieldErrorsOf(error);
      return actionError(Object.values(errors)[0] ?? "Some answers need correcting.", errors);
    }
    console.error("[content] write failed", error);
    return actionError("The change could not be saved. Please try again.");
  }
}

/* -------------------------------------------------------------------------- */
/* School settings                                                             */
/* -------------------------------------------------------------------------- */

/** Setting inputs are named `set.<key>`; a confirmed row also sends `ok.<key>`. */
export function settingsDraftFrom(formData: FormData) {
  const values: Record<string, string> = {};
  const confirmed: string[] = [];
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    if (key.startsWith("set.")) values[key.slice(4)] = value;
    else if (key.startsWith("ok.") && value === "on") confirmed.push(key.slice(3));
  }
  return { values, confirmed };
}

export function writeSettings(actor: Principal, formData: FormData): Promise<ActionState> {
  return attempt(actor, formData, async () => {
    const { changed } = await saveSettings(actor, settingsDraftFrom(formData));
    return actionOk(
      changed === 0
        ? "Nothing changed — every answer already matched what was stored."
        : `Saved ${changed} setting${changed === 1 ? "" : "s"}. The public site updates as soon as the row is confirmed.`,
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Homepage                                                                    */
/* -------------------------------------------------------------------------- */

export function writeHomepageSection(actor: Principal, formData: FormData): Promise<ActionState> {
  return attempt(actor, formData, async () => {
    const sectionKey = requiredId(formData, "homepage block");
    const input = {
      sectionKey,
      heading: text(formData, "heading"),
      subheading: text(formData, "subheading"),
      body: text(formData, "body"),
      ctaLabel: text(formData, "ctaLabel"),
      ctaHref: text(formData, "ctaHref"),
    };
    const saved = await saveHomepageSection(actor, input);
    return actionOk("The block's words are saved. Whether it appears on the homepage is a separate change.", saved.id);
  });
}

/** `show=on` puts the block in front of visitors; a form without it hides the block. */
export function writeHomepageSectionVisibility(actor: Principal, formData: FormData): Promise<ActionState> {
  return attempt(actor, formData, async () => {
    const sectionKey = requiredId(formData, "homepage block");
    const visible = formChecked(formData, "show");
    await setHomepageSectionVisibility(actor, sectionKey, visible);
    return actionOk(
      visible
        ? "The block now shows on the homepage."
        : "The block is hidden from the homepage. Its words are still here.",
    );
  });
}

/** Any published album ticked becomes a slideshow frame, in the order ticked. */
export function writeHeroAlbums(actor: Principal, formData: FormData): Promise<ActionState> {
  return attempt(actor, formData, async () => {
    const slugs: string[] = [];
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("hero.") && value === "on") slugs.push(key.slice(5));
    }
    const { accepted } = await setHeroAlbums(actor, slugs);
    if (slugs.length === 0) {
      return actionOk("The homepage slideshow is turned off. The campus photograph stays in its own band instead.");
    }
    const dropped = slugs.length - accepted.length;
    if (accepted.length === 0) {
      return actionOk(
        `All ${dropped} album${dropped === 1 ? "" : "s"} could not be used because they are not published and consent-cleared. Nothing was changed.`,
      );
    }
    return actionOk(
      `The homepage cycles through ${accepted.length} album${accepted.length === 1 ? "" : "s"}.` +
        (dropped > 0 ? ` ${dropped} could not be used because they are not published and consent-cleared.` : ""),
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Notices                                                                     */
/* -------------------------------------------------------------------------- */

function noticeInput(formData: FormData) {
  const rawAudience = formString(formData, "audience");
  // Unknown values fall back to public, the audience the form starts on.
  const audience: "public" | "staff" | "teachers" =
    rawAudience === "staff" || rawAudience === "teachers" ? rawAudience : "public";
  return {
    id: text(formData, "id"),
    title: text(formData, "title") ?? "",
    summary: text(formData, "summary"),
    body: text(formData, "body") ?? "",
    categoryKey: text(formData, "categoryKey"),
    referenceNumber: text(formData, "referenceNumber"),
    issuedOn: text(formData, "issuedOn"),
    expiresOn: text(formData, "expiresOn"),
    pinned: formChecked(formData, "pinned"),
    pinUntil: text(formData, "pinUntil"),
    audience,
  };
}

export function writeNotice(actor: Principal, formData: FormData): Promise<ActionState> {
  return attempt(actor, formData, async () => {
    const saved = await saveNotice(actor, noticeInput(formData));
    return actionOk("The notice is saved as a draft. Publishing is a separate step.", saved.id);
  });
}

const NOTICE_VERBS: Record<NoticeAction, string> = {
  publish: "Published",
  unpublish: "Taken down",
  archive: "Archived",
  schedule: "Scheduled",
};

export function writeNoticeStatus(actor: Principal, formData: FormData): Promise<ActionState> {
  return attempt(actor, formData, async () => {
    const id = requiredId(formData, "notice");
    const action = (formString(formData, "intent") ?? "publish") as NoticeAction;
    if (!(action in NOTICE_VERBS)) throw new ContentRejectedError("That is not a recognised notice action.");
    await setNoticeStatus(actor, id, action, { publishAt: text(formData, "publishAt") });
    return actionOk(`${NOTICE_VERBS[action]} — the board refreshes on the next visit.`);
  });
}

export function removeNotice(actor: Principal, formData: FormData): Promise<ActionState> {
  return attempt(actor, formData, async () => {
    const id = requiredId(formData, "notice");
    if (!formChecked(formData, "confirm")) {
      throw new ContentRejectedError("Tick the confirmation box before deleting a notice.");
    }
    await deleteNotice(actor, id);
    return actionOk("The notice and its attachments were removed.");
  });
}

/** There is no cron in this build, so releasing a scheduled notice is a button. */
export function writeScheduledReleases(actor: Principal, formData: FormData): Promise<ActionState> {
  return attempt(actor, formData, async () => {
    const released = await releaseDueNotices(actor);
    return actionOk(
      released === 0
        ? "No scheduled notice has reached its release time yet."
        : `Released ${released} scheduled notice${released === 1 ? "" : "s"} to the board.`,
    );
  });
}

export function writeNoticeAttachments(actor: Principal, formData: FormData): Promise<ActionState> {
  return attempt(actor, formData, async () => {
    const noticeId = requiredId(formData, "notice");
    const files = formData
      .getAll("attachments")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (files.length === 0) throw new ContentRejectedError("Choose at least one PDF or image file.");

    const result = await addNoticeAttachments(actor, noticeId, files, text(formData, "label"));
    if (result.added === 0) {
      return actionOk(`None of those files were accepted. ${result.rejected.join(" ")}`.trim());
    }
    return actionOk(
      `${result.added} file${result.added === 1 ? "" : "s"} attached. ` +
        (result.rejected.length > 0 ? `${result.rejected.length} were refused: ${result.rejected.join(" ")}` : "") +
        " A draft notice keeps its attachments out of the public download route.".trim(),
    );
  });
}

export function writeNoticeAttachmentRemove(actor: Principal, formData: FormData): Promise<ActionState> {
  return attempt(actor, formData, async () => {
    const noticeId = requiredId(formData, "notice");
    const documentId = requiredField(formData, "file", "file");
    if (!formChecked(formData, "confirm")) {
      throw new ContentRejectedError("Tick the confirmation box before detaching a file.");
    }
    await removeNoticeAttachment(actor, noticeId, documentId);
    return actionOk("The file is detached from the notice and locked against public download.");
  });
}

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

function eventInput(formData: FormData) {
  return {
    id: text(formData, "id"),
    title: text(formData, "title") ?? "",
    summary: text(formData, "summary"),
    description: text(formData, "description"),
    categoryKey: text(formData, "categoryKey"),
    startsAt: text(formData, "startsAt") ?? "",
    endsAt: text(formData, "endsAt"),
    allDay: formChecked(formData, "allDay"),
    venue: text(formData, "venue"),
    featured: formChecked(formData, "featured"),
  };
}

export function writeEvent(actor: Principal, formData: FormData): Promise<ActionState> {
  return attempt(actor, formData, async () => {
    const saved = await saveEvent(actor, eventInput(formData));
    return actionOk("The event is saved as a draft. Publishing is a separate step.", saved.id);
  });
}

export function writeEventStatus(actor: Principal, formData: FormData): Promise<ActionState> {
  return attempt(actor, formData, async () => {
    const id = requiredId(formData, "event");
    const action = formString(formData, "intent") ?? "publish";
    if (action !== "publish" && action !== "unpublish" && action !== "archive") {
      throw new ContentRejectedError("That is not a recognised event action.");
    }
    await setEventStatus(actor, id, action);
    return actionOk(
      action === "publish" ? "The event is on the public calendar." : action === "unpublish" ? "The event was taken down." : "The event is archived.",
    );
  });
}

export function removeEvent(actor: Principal, formData: FormData): Promise<ActionState> {
  return attempt(actor, formData, async () => {
    const id = requiredId(formData, "event");
    if (!formChecked(formData, "confirm")) {
      throw new ContentRejectedError("Tick the confirmation box before deleting an event.");
    }
    await deleteEvent(actor, id);
    return actionOk("The event and its registrations were removed.");
  });
}

/* -------------------------------------------------------------------------- */
/* Gallery                                                                     */
/* -------------------------------------------------------------------------- */

export function writeAlbum(actor: Principal, formData: FormData): Promise<ActionState> {
  return attempt(actor, formData, async () => {
    const input = {
      id: text(formData, "id"),
      title: text(formData, "title") ?? "",
      description: text(formData, "description"),
      categoryKey: text(formData, "categoryKey"),
    };
    const saved = await saveAlbum(actor, input);
    return actionOk("The album is saved. Photographs go to it from its own page.", saved.id);
  });
}

export function writeAlbumPhotos(actor: Principal, formData: FormData): Promise<ActionState> {
  return attempt(actor, formData, async () => {
    const albumId = requiredId(formData, "album");
    const files = formData.getAll("photos").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (files.length === 0) throw new ContentRejectedError("Choose at least one photograph file.");

    const result = await addAlbumPhotos(actor, albumId, files, {
      containsIdentifiableMinors: formChecked(formData, "containsIdentifiableMinors"),
      altText: text(formData, "altText"),
    });
    const album = await getAlbumForAdmin(albumId);
    return actionOk(
      result.added === 0
        ? `None of those files were accepted. ${result.rejected.join(" ")}`.trim()
        : `${result.added} photograph${result.added === 1 ? "" : "s"} added to “${album?.title ?? "the album"}”. ` +
          (result.rejected.length > 0 ? `${result.rejected.length} were refused: ${result.rejected.join(" ")}` : "") +
          " They are not public until consent is recorded and the album is published.".trim(),
    );
  });
}

const CONSENT_STATES = ["pending", "granted", "withdrawn", "not_required"] as const;

export function writePhotoConsent(actor: Principal, formData: FormData): Promise<ActionState> {
  return attempt(actor, formData, async () => {
    const itemId = requiredId(formData, "photograph");
    const consentStatus = formString(formData, "consentStatus");
    if (!consentStatus || !CONSENT_STATES.includes(consentStatus as (typeof CONSENT_STATES)[number])) {
      throw new ContentRejectedError("Choose one of the four consent states.");
    }
    await setPhotoConsent(actor, itemId, consentStatus as (typeof CONSENT_STATES)[number]);
    const labels: Record<string, string> = {
      pending: "waiting on a guardian's answer",
      granted: "recorded as granted",
      withdrawn: "withdrawn — the frame must be removed before the album can publish",
      not_required: "not needed — no identifiable pupil appears in it",
    };
    return actionOk(
      `Consent for that photograph is now ${labels[consentStatus]}. Any clearance for the whole album has been withdrawn.`,
    );
  });
}

export function writePhotoCaption(actor: Principal, formData: FormData): Promise<ActionState> {
  return attempt(actor, formData, async () => {
    const itemId = requiredId(formData, "photograph");
    // A field the form renders but the editor left blank is a deliberate clearing,
    // so it arrives as the empty string; a field that was never in the form is
    // absent and stays untouched.
    const altText = formData.has("altText") ? (text(formData, "altText") ?? "") : undefined;
    await setPhotoCaption(actor, itemId, {
      caption: text(formData, "caption"),
      credit: text(formData, "credit"),
      altText,
    });
    return actionOk("The photograph's text was updated.");
  });
}

export function writeAlbumCover(actor: Principal, formData: FormData): Promise<ActionState> {
  return attempt(actor, formData, async () => {
    const albumId = requiredId(formData, "album");
    const documentId = requiredId(formData, "documentId");
    await setAlbumCover(actor, albumId, documentId);
    return actionOk("That photograph is now the album's cover.");
  });
}

export function writePhotoRemove(actor: Principal, formData: FormData): Promise<ActionState> {
  return attempt(actor, formData, async () => {
    const itemId = requiredId(formData, "photograph");
    if (!formChecked(formData, "confirm")) {
      throw new ContentRejectedError("Tick the confirmation box before removing a photograph.");
    }
    await removeAlbumPhoto(actor, itemId);
    return actionOk("The photograph was removed from the album and its clearance was withdrawn.");
  });
}

export function writeAlbumPublish(actor: Principal, formData: FormData): Promise<ActionState> {
  return attempt(actor, formData, async () => {
    const albumId = requiredId(formData, "album");
    const intent = formString(formData, "intent") ?? "publish";
    if (intent === "unpublish") {
      await unpublishAlbum(actor, albumId);
      return actionOk("The album is off the public gallery again.");
    }
    if (intent !== "publish") throw new ContentRejectedError("That is not a recognised album action.");
    await publishAlbum(actor, albumId);
    return actionOk("The album is published. Every frame in it now has a recorded consent answer.");
  });
}
