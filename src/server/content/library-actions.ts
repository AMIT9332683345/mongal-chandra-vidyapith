"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, actionOk, type ActionState } from "@/lib/action-state";
import { formChecked, formString } from "@/lib/form-values";
import {
  AuthenticationError,
  AuthorizationError,
  constantTimeEquals,
  makeCsrfToken,
  principalHas,
  requirePermission,
  type Principal,
} from "@/server/auth/session";
import { ContentRejectedError } from "@/server/content/admin";
import * as library from "@/server/content/library";

/**
 * The Server Action entry points for the publishing desk beyond notices,
 * events and albums.
 *
 * The same rules hold as in `actions.ts`: the permission is asked of the server
 * row, the CSRF token is checked against this session, and a refusal is a
 * sentence rather than an exception, so the person's typing survives it.
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

function checkCsrf(actor: Principal, formData: FormData): void {
  const supplied = formString(formData, "csrfToken");
  if (!supplied || !constantTimeEquals(supplied, makeCsrfToken(actor.sessionId))) {
    throw new AuthorizationError("The security token on this form has expired. Reload the page and try again.");
  }
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

async function attempt(
  actor: Principal,
  formData: FormData,
  work: () => Promise<ActionState>,
): Promise<ActionState> {
  try {
    checkCsrf(actor, formData);
    return await work();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return actionError("Your session has ended. Sign in again to continue.");
    }
    if (error instanceof AuthorizationError) return actionError(error.message);
    if (error instanceof ContentRejectedError) return actionError(error.message);
    if (error instanceof z.ZodError) {
      const errors = fieldErrorsOf(error);
      return actionError(Object.values(errors)[0] ?? "Some answers need correcting.", errors);
    }
    console.error("[library] write failed", error);
    return actionError("The change could not be saved. Please try again.");
  }
}

function refresh(...paths: string[]): void {
  for (const path of paths) revalidatePath(path, "layout");
}

function filesFrom(formData: FormData, field: string): File[] {
  return formData.getAll(field).filter((entry): entry is File => entry instanceof File && entry.size > 0);
}

/* -------------------------------------------------------------------------- */
/* Downloads                                                                   */
/* -------------------------------------------------------------------------- */

export async function uploadDownloadsAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("document.upload");
  if (!actor) return refused("document.upload");
  return attempt(actor, formData, async () => {
    const result = await library.uploadDownloads(actor, filesFrom(formData, "files"), {
      title: formString(formData, "title") ?? "",
      description: formString(formData, "description"),
      category: formString(formData, "category"),
      visibility: formString(formData, "visibility") === "restricted" ? "restricted" : "public",
    });
    if (result.added === 0) {
      return actionError(result.rejected[0] ?? "No file could be stored.");
    }
    refresh("/downloads");
    return actionOk(
      `${result.added} file${result.added === 1 ? "" : "s"} published${result.rejected.length ? `; ${result.rejected.length} refused` : ""}.`,
    );
  });
}

export async function setDocumentVisibilityAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("document.upload");
  if (!actor) return refused("document.upload");
  return attempt(actor, formData, async () => {
    const id = formString(formData, "id");
    if (!id) return actionError("No file was named.");
    const visibility = formString(formData, "visibility") === "public" ? "public" : "restricted";
    await library.setDocumentVisibility(actor, id, visibility);
    refresh("/downloads");
    return actionOk(visibility === "public" ? "The file is now public." : "The file is now restricted.");
  });
}

export async function deleteDocumentAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("document.delete");
  if (!actor) return refused("document.delete");
  return attempt(actor, formData, async () => {
    const id = formString(formData, "id");
    if (!id) return actionError("No file was named.");
    await library.deleteDocument(actor, id);
    refresh("/downloads");
    return actionOk("The file was retired. It no longer appears on the website.");
  });
}

/* -------------------------------------------------------------------------- */
/* Testimonials                                                                */
/* -------------------------------------------------------------------------- */

export async function saveTestimonialAction(formData: FormData): Promise<ActionState> {
  const permission = formString(formData, "id") ? "homepage.edit" : "homepage.edit";
  const actor = await permitted(permission);
  if (!actor) return refused(permission);
  return attempt(actor, formData, async () => {
    const result = await library.saveTestimonial(actor, {
      id: formString(formData, "id") ?? undefined,
      quote: formString(formData, "quote") ?? "",
      authorName: formString(formData, "authorName") ?? "",
      authorRole: (formString(formData, "authorRole") ?? "parent") as
        | "parent"
        | "alumnus"
        | "student"
        | "teacher"
        | "wellwisher",
      authorDetail: formString(formData, "authorDetail"),
      consentRecorded: formChecked(formData, "consentRecorded"),
      sortOrder: Number.parseInt(formString(formData, "sortOrder") ?? "100", 10) || 100,
    });
    refresh("/");
    return actionOk(
      formString(formData, "id") ? "The testimonial was saved." : "The testimonial was saved as a draft.",
      result.id,
    );
  });
}

export async function changeTestimonialStatusAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("homepage.publish");
  if (!actor) return refused("homepage.publish");
  return attempt(actor, formData, async () => {
    const id = formString(formData, "id");
    const intent = formString(formData, "intent");
    if (!id) return actionError("No testimonial was named.");
    if (intent !== "publish" && intent !== "unpublish" && intent !== "archive") {
      return actionError("That action is not recognised.");
    }
    await library.setTestimonialStatus(actor, id, intent);
    refresh("/");
    return actionOk(
      intent === "publish" ? "The testimonial is now on the homepage." : "The testimonial is no longer public.",
    );
  });
}

export async function deleteTestimonialAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("homepage.publish");
  if (!actor) return refused("homepage.publish");
  return attempt(actor, formData, async () => {
    const id = formString(formData, "id");
    if (!id) return actionError("No testimonial was named.");
    await library.deleteTestimonial(actor, id);
    refresh("/");
    return actionOk("The testimonial was deleted.");
  });
}

/* -------------------------------------------------------------------------- */
/* Questions                                                                   */
/* -------------------------------------------------------------------------- */

export async function saveFaqAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("faq.edit");
  if (!actor) return refused("faq.edit");
  return attempt(actor, formData, async () => {
    const result = await library.saveFaq(actor, {
      id: formString(formData, "id") ?? undefined,
      question: formString(formData, "question") ?? "",
      answer: formString(formData, "answer") ?? "",
      category: formString(formData, "category") ?? undefined,
      sortOrder: Number.parseInt(formString(formData, "sortOrder") ?? "100", 10) || 100,
    });
    refresh("/", "/contact");
    return actionOk("The question was saved.", result.id);
  });
}

export async function changeFaqPublishedAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("faq.edit");
  if (!actor) return refused("faq.edit");
  return attempt(actor, formData, async () => {
    const id = formString(formData, "id");
    if (!id) return actionError("No question was named.");
    const published = formString(formData, "intent") === "publish";
    await library.setFaqPublished(actor, id, published);
    refresh("/", "/contact");
    return actionOk(published ? "The question is now shown publicly." : "The question is now hidden.");
  });
}

export async function deleteFaqAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("faq.edit");
  if (!actor) return refused("faq.edit");
  return attempt(actor, formData, async () => {
    const id = formString(formData, "id");
    if (!id) return actionError("No question was named.");
    await library.deleteFaq(actor, id);
    refresh("/", "/contact");
    return actionOk("The question was deleted.");
  });
}

/* -------------------------------------------------------------------------- */
/* Editable pages                                                              */
/* -------------------------------------------------------------------------- */

export async function saveContentPageAction(formData: FormData): Promise<ActionState> {
  const permission = formString(formData, "id") ? "page.edit" : "page.create";
  const actor = await permitted(permission);
  if (!actor) return refused(permission);
  return attempt(actor, formData, async () => {
    const editing = formString(formData, "id") !== null;
    const result = await library.saveContentPage(actor, {
      id: formString(formData, "id") ?? undefined,
      slug: formString(formData, "slug") ?? undefined,
      title: formString(formData, "title") ?? "",
      intro: formString(formData, "intro"),
      body: formString(formData, "body"),
      seoTitle: formString(formData, "seoTitle"),
      seoDescription: formString(formData, "seoDescription"),
      noIndex: formChecked(formData, "noIndex"),
    });
    refresh("/", `/pages/${result.slug}`);
    return actionOk(
      editing
        ? "The page was saved. If it is published, the change is already on the website."
        : "The page was saved as a draft.",
      result.id,
    );
  });
}

export async function changeContentPageStatusAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("page.publish");
  if (!actor) return refused("page.publish");
  return attempt(actor, formData, async () => {
    const id = formString(formData, "id");
    const intent = formString(formData, "intent");
    if (!id) return actionError("No page was named.");
    if (intent !== "publish" && intent !== "unpublish" && intent !== "archive") {
      return actionError("That action is not recognised.");
    }
    await library.setContentPageStatus(actor, id, intent);
    refresh("/");
    return actionOk(intent === "publish" ? "The page is now live." : "The page is no longer public.");
  });
}

export async function deleteContentPageAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("page.publish");
  if (!actor) return refused("page.publish");
  return attempt(actor, formData, async () => {
    const id = formString(formData, "id");
    if (!id) return actionError("No page was named.");
    await library.deleteContentPage(actor, id);
    refresh("/");
    return actionOk("The page was archived.");
  });
}

/* -------------------------------------------------------------------------- */
/* Achievements                                                                */
/* -------------------------------------------------------------------------- */

export async function saveAchievementAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("achievement.edit");
  if (!actor) return refused("achievement.edit");
  return attempt(actor, formData, async () => {
    const result = await library.saveAchievement(actor, {
      id: formString(formData, "id") ?? undefined,
      title: formString(formData, "title") ?? "",
      description: formString(formData, "description"),
      category: formString(formData, "category") ?? undefined,
      achievedOn: formString(formData, "achievedOn"),
      eventName: formString(formData, "eventName"),
      awardingBody: formString(formData, "awardingBody"),
      confirmed: formChecked(formData, "confirmed"),
    });
    refresh("/", "/results");
    return actionOk("The achievement was saved.", result.id);
  });
}

export async function changeAchievementStatusAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("achievement.edit");
  if (!actor) return refused("achievement.edit");
  return attempt(actor, formData, async () => {
    const id = formString(formData, "id");
    if (!id) return actionError("No achievement was named.");
    const publish = formString(formData, "intent") === "publish";
    await library.setAchievementStatus(actor, id, publish ? "publish" : "unpublish");
    refresh("/", "/results");
    return actionOk(publish ? "The achievement is now public." : "The achievement is now hidden.");
  });
}

export async function deleteAchievementAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("achievement.edit");
  if (!actor) return refused("achievement.edit");
  return attempt(actor, formData, async () => {
    const id = formString(formData, "id");
    if (!id) return actionError("No achievement was named.");
    await library.deleteAchievement(actor, id);
    refresh("/", "/results");
    return actionOk("The achievement was deleted.");
  });
}

/* -------------------------------------------------------------------------- */
/* Admissions and enquiries                                                    */
/* -------------------------------------------------------------------------- */

export async function changeApplicationStatusAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("admission.review");
  if (!actor) return refused("admission.review");
  return attempt(actor, formData, async () => {
    const id = formString(formData, "id");
    const status = formString(formData, "status");
    if (!id) return actionError("No application was named.");
    if (!status || !library.APPLICATION_STATUSES.includes(status as library.ApplicationStatus)) {
      return actionError("That application status is not recognised.");
    }
    if ((status === "accepted" || status === "rejected") && !principalHas(actor, "admission.decide")) {
      return refused("admission.decide");
    }
    await library.setApplicationStatus(
      actor,
      id,
      status as library.ApplicationStatus,
      formString(formData, "notes"),
    );
    refresh("/portal/admin/applications");
    return actionOk("The application was updated.");
  });
}

export async function changeEnquiryStatusAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("enquiry.respond");
  if (!actor) return refused("enquiry.respond");
  return attempt(actor, formData, async () => {
    const id = formString(formData, "id");
    const status = formString(formData, "status");
    if (!id) return actionError("No enquiry was named.");
    const allowed = ["open", "in_progress", "awaiting_applicant", "completed", "rejected", "cancelled"];
    if (!status || !allowed.includes(status)) return actionError("That enquiry status is not recognised.");
    await library.setEnquiryStatus(
      actor,
      id,
      status as "open" | "in_progress" | "awaiting_applicant" | "completed" | "rejected" | "cancelled",
      formString(formData, "responseText"),
    );
    refresh("/portal/admin/enquiries");
    return actionOk("The enquiry was updated.");
  });
}

/* -------------------------------------------------------------------------- */
/* Accounts                                                                    */
/* -------------------------------------------------------------------------- */

export async function createUserAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("user.create");
  if (!actor) return refused("user.create");
  return attempt(actor, formData, async () => {
    const result = await library.createPanelUser(actor, {
      email: formString(formData, "email") ?? "",
      displayName: formString(formData, "displayName") ?? "",
      roleId: formString(formData, "roleId") ?? "",
    });
    refresh("/portal/admin/users");
    return actionOk(
      `The account was created. One-time password: ${result.password} — hand it over privately; it is shown only now.`,
      result.id,
    );
  });
}

export async function assignUserRoleAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("role.assign");
  if (!actor) return refused("role.assign");
  return attempt(actor, formData, async () => {
    const userId = formString(formData, "userId");
    const roleId = formString(formData, "roleId");
    if (!userId || !roleId) return actionError("Choose an account and a role.");
    await library.assignUserRole(actor, userId, roleId);
    refresh("/portal/admin/users");
    return actionOk("The role was changed.");
  });
}

export async function setUserActiveAction(formData: FormData): Promise<ActionState> {
  const actor = await permitted("user.deactivate");
  if (!actor) return refused("user.deactivate");
  return attempt(actor, formData, async () => {
    const userId = formString(formData, "userId");
    if (!userId) return actionError("No account was named.");
    const active = formString(formData, "intent") === "activate";
    await library.setUserActive(actor, userId, active);
    refresh("/portal/admin/users");
    return actionOk(active ? "The account can sign in again." : "The account was suspended and signed out.");
  });
}
