"use server";

import { revalidatePath } from "next/cache";
import { actionError, type ActionState } from "@/lib/action-state";
import { formString } from "@/lib/form-values";
import {
  AuthenticationError,
  AuthorizationError,
  requirePermission,
  type Principal,
} from "@/server/auth/session";
import * as write from "@/server/content/writes";

/**
 * The content panel's entry points.
 *
 * Every function here is a Server Action, so it is reachable by a POST from the
 * browser carrying nothing but the form's own fields. That is exactly why each one
 * begins by asking the server who is calling and whether that person holds the
 * permission for this specific act — the buttons a page renders are a courtesy to
 * the person using the panel, never the check. Saving a draft and publishing it
 * are separate permissions, so a form that meant only to save cannot publish by
 * accident, and an editor with no publishing rights cannot publish by intent.
 */

/**
 * The permission, or nothing.
 *
 * A refusal comes back as an ordinary form message rather than an exception,
 * because a Server Action that throws loses whatever the person was typing. The
 * denial is still recorded by the session layer and still reaches the audit trail
 * as the attempted action, so a refused write is visible in the trail and not
 * merely a page that did nothing.
 */
async function permitted(permission: string): Promise<Principal | null> {
  try {
    return await requirePermission(permission);
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) return null;
    throw error;
  }
}

function refused(permission: string): ActionState {
  return actionError(
    `That change needs the “${permission}” permission, which this account does not hold. Nothing was written.`,
  );
}

/** Which public pages a change is visible on, so a cached render is not stale. */
function refresh(...paths: string[]): void {
  for (const path of paths) revalidatePath(path, "layout");
}

/** True when the form carries a record id, which is what separates an edit from a create. */
function isEdit(formData: FormData): boolean {
  return formString(formData, "id") !== null;
}

/* -------------------------------------------------------------------------- */
/* School settings and the homepage                                            */
/* -------------------------------------------------------------------------- */

export async function saveSettingsAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("school_setting.edit");
  if (!actor) return refused("school_setting.edit");
  const result = await write.writeSettings(actor, formData);
  if (result.ok) refresh("/", "/about", "/contact", "/academics", "/admissions");
  return result;
}

export async function saveHomepageSectionAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("homepage.edit");
  if (!actor) return refused("homepage.edit");
  const result = await write.writeHomepageSection(actor, formData);
  if (result.ok) refresh("/");
  return result;
}

/**
 * Showing or hiding a homepage block is the publishable act, so it needs
 * `homepage.publish` on its own and not the right to edit the wording.
 *
 * Keeping the two apart is what lets a copy editor fix a sentence inside a live
 * block without the block disappearing while they save, and stops someone with no
 * publishing rights from putting a block in front of families by typing into it.
 */
export async function changeHomepageSectionVisibilityAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("homepage.publish");
  if (!actor) return refused("homepage.publish");
  const result = await write.writeHomepageSectionVisibility(actor, formData);
  if (result.ok) refresh("/");
  return result;
}

export async function saveHeroAlbumsAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("homepage.publish");
  if (!actor) return refused("homepage.publish");
  const result = await write.writeHeroAlbums(actor, formData);
  if (result.ok) refresh("/");
  return result;
}

/* -------------------------------------------------------------------------- */
/* Notices                                                                     */
/* -------------------------------------------------------------------------- */

export async function saveNoticeAction(formData: FormData): Promise<ActionState> {
  const permission = isEdit(formData) ? "notice.edit" : "notice.create";
  const actor = await permitted(permission);
  if (!actor) return refused(permission);
  const result = await write.writeNotice(actor, formData);
  if (result.ok) refresh("/notices");
  return result;
}

/**
 * Publishing, taking down, scheduling and archiving all need `notice.publish`.
 *
 * Moving a notice onto or off the public board is one capability seen from two
 * ends: whoever may put a notice in front of every family is the same person who
 * may take it away. `notice.edit` is deliberately not enough, because an editor
 * who could also un-publish would hold the publishing permission under another
 * name.
 */
export async function changeNoticeStatusAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("notice.publish");
  if (!actor) return refused("notice.publish");
  const result = await write.writeNoticeStatus(actor, formData);
  if (result.ok) refresh("/notices", "/");
  return result;
}

export async function deleteNoticeAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("notice.delete");
  if (!actor) return refused("notice.delete");
  const result = await write.removeNotice(actor, formData);
  if (result.ok) refresh("/notices", "/");
  return result;
}

export async function releaseScheduledNoticesAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("notice.publish");
  if (!actor) return refused("notice.publish");
  const result = await write.writeScheduledReleases(actor, formData);
  if (result.ok) refresh("/notices", "/");
  return result;
}

/**
 * Attaching a circular writes a document row, so it needs the library permission
 * as well as the right to edit the notice. The file itself is not published by
 * this act — only the notice being published makes it downloadable.
 */
export async function addNoticeAttachmentAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("notice.edit");
  if (!actor) return refused("notice.edit");
  const uploader = await permitted("document.upload");
  if (!uploader) return refused("document.upload");
  const result = await write.writeNoticeAttachments(actor, formData);
  if (result.ok) refresh("/notices");
  return result;
}

export async function removeNoticeAttachmentAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("notice.edit");
  if (!actor) return refused("notice.edit");
  const result = await write.writeNoticeAttachmentRemove(actor, formData);
  if (result.ok) refresh("/notices");
  return result;
}

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

export async function saveEventAction(formData: FormData): Promise<ActionState> {
  const permission = isEdit(formData) ? "event.edit" : "event.create";
  const actor = await permitted(permission);
  if (!actor) return refused(permission);
  const result = await write.writeEvent(actor, formData);
  if (result.ok) refresh("/events");
  return result;
}

export async function changeEventStatusAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("event.publish");
  if (!actor) return refused("event.publish");
  const result = await write.writeEventStatus(actor, formData);
  if (result.ok) refresh("/events", "/");
  return result;
}

export async function deleteEventAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("event.delete");
  if (!actor) return refused("event.delete");
  const result = await write.removeEvent(actor, formData);
  if (result.ok) refresh("/events", "/");
  return result;
}

/* -------------------------------------------------------------------------- */
/* Gallery                                                                     */
/* -------------------------------------------------------------------------- */

export async function saveAlbumAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("gallery.edit");
  if (!actor) return refused("gallery.edit");
  const result = await write.writeAlbum(actor, formData);
  if (result.ok) refresh("/gallery");
  return result;
}

/**
 * Uploading needs both the right to file a photograph and the right to put a file
 * in the document library, because the upload writes a document row.
 */
export async function uploadAlbumPhotosAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("gallery.edit");
  if (!actor) return refused("gallery.edit");
  const uploader = await permitted("document.upload");
  if (!uploader) return refused("document.upload");
  const result = await write.writeAlbumPhotos(actor, formData);
  if (result.ok) refresh("/gallery");
  return result;
}

export async function setPhotoConsentAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("gallery.consent.verify");
  if (!actor) return refused("gallery.consent.verify");
  const result = await write.writePhotoConsent(actor, formData);
  if (result.ok) refresh("/gallery");
  return result;
}

export async function setPhotoCaptionAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("gallery.edit");
  if (!actor) return refused("gallery.edit");
  return write.writePhotoCaption(actor, formData);
}

export async function setAlbumCoverAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("gallery.edit");
  if (!actor) return refused("gallery.edit");
  const result = await write.writeAlbumCover(actor, formData);
  if (result.ok) refresh("/gallery", "/");
  return result;
}

export async function removeAlbumPhotoAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("gallery.edit");
  if (!actor) return refused("gallery.edit");
  const result = await write.writePhotoRemove(actor, formData);
  if (result.ok) refresh("/gallery", "/");
  return result;
}

/**
 * Publishing an album is the one act that needs two permissions, held by the same
 * person on the same request: the right to publish, and the rarer right to certify
 * that a guardian consented to every identifiable pupil in it.
 */
export async function publishAlbumAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("gallery.publish");
  if (!actor) return refused("gallery.publish");
  if ((formString(formData, "intent") ?? "publish") === "publish") {
    const verifier = await permitted("gallery.consent.verify");
    if (!verifier) return refused("gallery.consent.verify");
  }
  const result = await write.writeAlbumPublish(actor, formData);
  if (result.ok) refresh("/gallery", "/");
  return result;
}
