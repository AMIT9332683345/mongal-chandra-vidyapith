import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { findDoc, findDocs } from "@/server/db/mongo/repository";
import { POST as accountRoute } from "@/app/api/auth/account/route";
import { POST as recoveryRoute } from "@/app/api/auth/recovery/route";
import { POST as signInRoute } from "@/app/api/auth/session/route";
import { changeOwnEmail, normalizeEmailAddress } from "@/server/auth/change-email";
import { requestAccountRecovery } from "@/server/auth/recovery";
import {
  FORM_TOKEN_COOKIE,
  SESSION_COOKIE,
  createSession,
  hashIp,
  issueFormToken,
  loadGrants,
  makeCsrfToken,
  resolvePrincipal,
  revokeSession,
  type Principal,
} from "@/server/auth/session";
import { verifyPassword } from "@/server/auth/passwords";
import {
  ContentRejectedError,
  audienceFromRoles,
  saveNotice,
  setNoticeStatus,
} from "@/server/content/admin";
import {
  listRecoveryRequests,
  resetUserPassword,
  resolveRecoveryRequest,
  updateUserEmail,
} from "@/server/content/library";
import { listNoticesForStaff } from "@/server/content/staff";
import { listPublicNotices } from "@/server/content/site";
import { createAccount, fixtureEmail } from "./fixtures";

/**
 * Account ownership, recovery and staff-only notices.
 *
 * Three promises are proved here. An address change is guarded like a password
 * and ends every sign-in. A recovery request never tells the visitor whether the
 * account exists, and the office answers it with a credential the holder must
 * replace. A notice written for teachers is published without ever reaching the
 * website, which is the point of having a teacher area at all.
 */

const RUN = randomUUID().slice(0, 8);

let nextIp = 0;
function freshIp(): string {
  nextIp += 1;
  return `203.0.113.${(nextIp % 200) + 1}.${nextIp}.${RUN}`;
}

async function principalFor(userId: string): Promise<Principal> {
  const grants = await loadGrants(userId);
  const account = await findDoc("users", { id: userId }, { projection: { email: 1, displayName: 1 } });
  if (!account) throw new Error("Fixture account disappeared.");
  return {
    userId,
    email: account.email,
    displayName: account.displayName,
    mustChangePassword: false,
    sessionId: "test-session",
    roleKeys: grants.roleKeys,
    grants: grants.grants,
  };
}

let admin: Principal | null = null;
async function adminPrincipal(): Promise<Principal> {
  if (!admin) {
    const account = await createAccount("super_admin", `recovery-admin-${RUN}`);
    admin = await principalFor(account.userId);
  }
  return admin;
}

async function userRow(userId: string) {
  const row = await findDoc("users", { id: userId });
  if (!row) throw new Error("Fixture account is not in the database.");
  return row;
}

function auditRowsFor(userId: string) {
  return findDocs(
    "audit_logs",
    { actorUserId: userId },
    { projection: { action: 1, summary: 1, metadata: 1 }, sort: { createdAt: -1 } },
  );
}

describe("changing the address you sign in with", () => {
  it("refuses a wrong password and leaves the row untouched", async () => {
    const account = await createAccount("teacher", "email-wrong");
    const outcome = await changeOwnEmail({
      userId: account.userId,
      currentPassword: "not-the-right-password-1",
      newEmail: fixtureEmail("moved"),
    });

    expect(outcome).toMatchObject({ ok: false, code: "wrong_password" });
    expect((await userRow(account.userId)).email).toBe(account.email);
  });

  it("refuses an address that is not an address", async () => {
    const account = await createAccount("teacher", "email-invalid");
    const outcome = await changeOwnEmail({
      userId: account.userId,
      currentPassword: account.password,
      newEmail: "not-an-address",
    });

    expect(outcome).toMatchObject({ ok: false, code: "invalid_email" });
    expect((await userRow(account.userId)).email).toBe(account.email);
  });

  it("refuses the address the account already uses, whatever its case", async () => {
    const account = await createAccount("teacher", "email-same");
    const outcome = await changeOwnEmail({
      userId: account.userId,
      currentPassword: account.password,
      newEmail: account.email.toUpperCase(),
    });

    expect(outcome).toMatchObject({ ok: false, code: "unchanged" });
  });

  it("refuses an address another account holds, ignoring case", async () => {
    const holder = await createAccount("teacher", "email-holder");
    const mover = await createAccount("teacher", "email-mover");

    const outcome = await changeOwnEmail({
      userId: mover.userId,
      currentPassword: mover.password,
      newEmail: holder.email.toUpperCase(),
    });

    expect(outcome).toMatchObject({ ok: false, code: "in_use" });
    expect((await userRow(mover.userId)).email).toBe(mover.email);
  });

  it("stores a new address in lower case and keeps the password working", async () => {
    const account = await createAccount("teacher", "email-move");
    const target = fixtureEmail("email-target");

    const outcome = await changeOwnEmail({
      userId: account.userId,
      currentPassword: account.password,
      newEmail: `  ${target.toUpperCase()}  `,
    });

    expect(outcome).toEqual({ ok: true, email: target });
    const row = await userRow(account.userId);
    expect(row.email).toBe(target);
    expect(await verifyPassword(account.password, row.passwordHash)).toBe(true);
    expect(normalizeEmailAddress("  A@B.CO  ")).toBe("a@b.co");
  });

  it("answers a suspended account as a wrong password rather than a clue", async () => {
    const account = await createAccount("teacher", "email-dormant", { status: "suspended" });
    const outcome = await changeOwnEmail({
      userId: account.userId,
      currentPassword: account.password,
      newEmail: fixtureEmail("dormant-target"),
    });

    expect(outcome).toMatchObject({ ok: false, code: "wrong_password" });
  });
});

describe("the forgotten-credential queue", () => {
  it("records a matching request against the account without revealing it publicly", async () => {
    const account = await createAccount("teacher", "recover-known");
    const received = await requestAccountRecovery({
      identifier: account.email.toUpperCase(),
      ipHash: hashIp(freshIp()) ?? "unknown",
      userAgent: "fixture-agent",
    });

    expect(received.matched).toBe(true);
    const row = await findDoc("account_recovery_requests", { id: received.id });
    expect(row?.matchedUserId).toBe(account.userId);
    expect(row?.status).toBe("open");
    expect(row?.kind).toBe("either");

    const queue = await listRecoveryRequests();
    const listed = queue.find((entry) => entry.id === received.id);
    expect(listed?.matchedUser?.email).toBe(account.email);
  });

  it("answers a stranger exactly as it answers a member", async () => {
    const known = await requestAccountRecovery({
      identifier: fixtureEmail("recover-unknown-a"),
      ipHash: hashIp(freshIp()) ?? "unknown",
      userAgent: "fixture-agent",
    });
    const stranger = await requestAccountRecovery({
      identifier: `Nobody ${RUN}`,
      ipHash: hashIp(freshIp()) ?? "unknown",
      userAgent: "fixture-agent",
    });

    expect(known.matched).toBe(false);
    expect(stranger.matched).toBe(false);
    // Both are written down; neither result tells the browser anything different.
    expect(known.id).toMatch(/[0-9a-f-]{36}/);
    expect(stranger.id).toMatch(/[0-9a-f-]{36}/);

    const queue = await listRecoveryRequests();
    expect(queue.find((entry) => entry.id === stranger.id)?.matchedUser).toBeNull();
  });

  it("matches a display name as well as an address", async () => {
    const account = await createAccount("teacher", "recover-by-name");
    const name = (await userRow(account.userId)).displayName as string;

    const received = await requestAccountRecovery({
      identifier: name,
      ipHash: hashIp(freshIp()) ?? "unknown",
      userAgent: "fixture-agent",
    });
    expect(received.matched).toBe(true);
  });

  it("keeps the identifier out of the audit summary", async () => {
    const identifier = fixtureEmail("recover-private");
    const received = await requestAccountRecovery({
      identifier,
      ipHash: hashIp(freshIp()) ?? "unknown",
      userAgent: "fixture-agent",
    });

    const row = await findDoc("audit_logs", { resourceId: received.id, action: "auth.recovery_requested" });
    expect(row).toBeTruthy();
    expect(row?.summary).not.toContain(identifier);
    expect(JSON.stringify(row?.metadata ?? {})).not.toContain(identifier);
  });

  it("issues a one-time password that works, then closes the request", async () => {
    const actor = await adminPrincipal();
    const account = await createAccount("teacher", "recover-reset");
    const otherDevice = await createSession(account.userId, {
      ipHash: hashIp(freshIp()) ?? "unknown",
      userAgent: "fixture-other-device",
    });
    const received = await requestAccountRecovery({
      identifier: account.email,
      ipHash: hashIp(freshIp()) ?? "unknown",
      userAgent: "fixture-agent",
    });

    const outcome = await resolveRecoveryRequest(actor, received.id, "reset");
    expect(outcome.password).toBeTruthy();

    const row = await userRow(account.userId);
    expect(await verifyPassword(outcome.password!, row.passwordHash)).toBe(true);
    expect(await verifyPassword(account.password, row.passwordHash)).toBe(false);
    expect(row.mustChangePassword).toBe(true);
    expect(await resolvePrincipal(otherDevice.token)).toBeNull();

    const request = await findDoc("account_recovery_requests", { id: received.id });
    expect(request?.status).toBe("resolved");
    expect(request?.resolvedByUserId).toBe(actor.userId);
    expect((await listRecoveryRequests()).some((entry) => entry.id === received.id)).toBe(false);
  });

  it("refuses to invent an account for a request nobody matches", async () => {
    const actor = await adminPrincipal();
    const received = await requestAccountRecovery({
      identifier: `Unknown ${RUN}`,
      ipHash: hashIp(freshIp()) ?? "unknown",
      userAgent: "fixture-agent",
    });

    await expect(resolveRecoveryRequest(actor, received.id, "reset")).rejects.toBeInstanceOf(
      ContentRejectedError,
    );
    const request = await findDoc("account_recovery_requests", { id: received.id });
    expect(request?.status).toBe("open");
  });

  it("dismisses a request without touching any password", async () => {
    const actor = await adminPrincipal();
    const account = await createAccount("teacher", "recover-dismiss");
    const before = await userRow(account.userId);
    const received = await requestAccountRecovery({
      identifier: account.email,
      ipHash: hashIp(freshIp()) ?? "unknown",
      userAgent: "fixture-agent",
    });

    const outcome = await resolveRecoveryRequest(actor, received.id, "dismiss");
    expect(outcome.password).toBeNull();
    expect((await userRow(account.userId)).passwordHash).toBe(before.passwordHash);

    const request = await findDoc("account_recovery_requests", { id: received.id });
    expect(request?.status).toBe("dismissed");
  });

  it("will not close the same request twice", async () => {
    const actor = await adminPrincipal();
    const received = await requestAccountRecovery({
      identifier: `Twice ${RUN}`,
      ipHash: hashIp(freshIp()) ?? "unknown",
      userAgent: "fixture-agent",
    });
    await resolveRecoveryRequest(actor, received.id, "dismiss");

    await expect(resolveRecoveryRequest(actor, received.id, "dismiss")).rejects.toBeInstanceOf(
      ContentRejectedError,
    );
  });
});

describe("the office editing another account", () => {
  it("changes an address, records it, and signs the account out everywhere", async () => {
    const actor = await adminPrincipal();
    const account = await createAccount("teacher", "office-email");
    const session = await createSession(account.userId, {
      ipHash: hashIp(freshIp()) ?? "unknown",
      userAgent: "fixture-agent",
    });
    const target = fixtureEmail("office-target");

    await updateUserEmail(actor, account.userId, ` ${target.toUpperCase()} `);

    expect((await userRow(account.userId)).email).toBe(target);
    expect(await resolvePrincipal(session.token)).toBeNull();

    const audit = await auditRowsFor(actor.userId);
    const row = audit.find((entry) => entry.action === "user.email_changed");
    expect(row?.summary).not.toContain(target);
    expect(JSON.stringify(row?.metadata ?? {})).toContain(target);
  });

  it("refuses an address another account already holds", async () => {
    const actor = await adminPrincipal();
    const first = await createAccount("teacher", "office-first");
    const second = await createAccount("teacher", "office-second");

    await expect(updateUserEmail(actor, second.userId, first.email.toUpperCase())).rejects.toBeInstanceOf(
      ContentRejectedError,
    );
    expect((await userRow(second.userId)).email).toBe(second.email);
  });

  it("issues a one-time password and ends the account's sessions", async () => {
    const actor = await adminPrincipal();
    const account = await createAccount("teacher", "office-reset");
    const session = await createSession(account.userId, {
      ipHash: hashIp(freshIp()) ?? "unknown",
      userAgent: "fixture-agent",
    });

    const issued = await resetUserPassword(actor, account.userId);
    const row = await userRow(account.userId);

    expect(await verifyPassword(issued.password, row.passwordHash)).toBe(true);
    expect(await verifyPassword(account.password, row.passwordHash)).toBe(false);
    expect(row.mustChangePassword).toBe(true);
    expect(await resolvePrincipal(session.token)).toBeNull();

    const audit = await auditRowsFor(actor.userId);
    const summary = audit.find((entry) => entry.action === "user.password_reset")?.summary ?? "";
    expect(summary).not.toContain(issued.password);
  });
});

describe("notices written for staff", () => {
  function listenerNotice(audience: "public" | "teachers", label: string) {
    return {
      id: null,
      title: `Fixture ${label} notice ${RUN}`,
      summary: null,
      body: "Fixture notice text.",
      categoryKey: null,
      referenceNumber: null,
      pinned: false,
      issuedOn: null,
      expiresOn: null,
      pinUntil: null,
      audience,
    };
  }

  it("publishes a teachers-only notice to the teacher area and never to the website", async () => {
    const actor = await adminPrincipal();
    const saved = await saveNotice(actor, listenerNotice("teachers", "teachers-only"));
    await setNoticeStatus(actor, saved.id, "publish");

    const staff = await listNoticesForStaff(["teacher"]);
    expect(staff.map((notice) => notice.slug)).toContain(saved.slug);

    const website = await listPublicNotices({ limit: 100 });
    expect(website.map((notice) => notice.slug)).not.toContain(saved.slug);

    // A role outside the audience does not reach it, even with a valid session.
    const pupils = await listNoticesForStaff(["student"]);
    expect(pupils.map((notice) => notice.slug)).not.toContain(saved.slug);

    const row = await findDoc("notices", { id: saved.id });
    expect(row?.status).toBe("published");
    expect(row?.publicVisible).toBe(false);
  });

  it("still puts a public-audience notice on the website and not in the staff inbox", async () => {
    const actor = await adminPrincipal();
    const saved = await saveNotice(actor, listenerNotice("public", "public"));
    await setNoticeStatus(actor, saved.id, "publish");

    const website = await listPublicNotices({ limit: 100 });
    expect(website.map((notice) => notice.slug)).toContain(saved.slug);

    const staff = await listNoticesForStaff(["teacher"]);
    expect(staff.map((notice) => notice.slug)).not.toContain(saved.slug);

    const row = await findDoc("notices", { id: saved.id });
    expect(row?.publicVisible).toBe(true);
  });

  it("takes a published teachers-only notice off the site when its audience widens", async () => {
    const actor = await adminPrincipal();
    const saved = await saveNotice(actor, listenerNotice("teachers", "widening"));
    await setNoticeStatus(actor, saved.id, "publish");

    const widened = await saveNotice(actor, {
      ...listenerNotice("public", "widening"),
      id: saved.id,
      title: `Fixture widened notice ${RUN}`,
    });

    const row = await findDoc("notices", { id: saved.id });
    expect(row?.publicVisible).toBe(true);
    const website = await listPublicNotices({ limit: 100 });
    expect(website.map((notice) => notice.slug)).toContain(widened.slug);
  });

  it("reads the stored audience back as the value the form shows", () => {
    expect(audienceFromRoles([])).toBe("public");
    expect(audienceFromRoles(["teacher"])).toBe("teachers");
    expect(audienceFromRoles(["teacher", "principal"])).toBe("staff");
    expect(audienceFromRoles(undefined)).toBe("public");
  });

  it("does not reveal a staff notice to a visitor who guesses its address", async () => {
    const actor = await adminPrincipal();
    const saved = await saveNotice(actor, listenerNotice("teachers", "guarded"));
    await setNoticeStatus(actor, saved.id, "publish");

    // The read layer is filtered by `publicVisible`, so the slug is not enough.
    const { getPublicNoticeBySlug } = await import("@/server/content/site");
    expect(await getPublicNoticeBySlug(saved.slug)).toBeNull();
  });
});

describe("the self-service email endpoint", () => {
  async function signedIn(label: string) {
    const account = await createAccount("teacher", label);
    const session = await createSession(account.userId, {
      ipHash: hashIp(freshIp()) ?? "unknown",
      userAgent: "fixture-agent",
    });
    return { account, session };
  }

  function postEmail(
    session: { token: string; csrfToken: string } | null,
    fields: Record<string, string>,
    { sendToken = true }: { sendToken?: boolean } = {},
  ): Promise<Response> {
    const form = new FormData();
    if (session && sendToken) form.set("csrfToken", session.csrfToken);
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    const headers = new Headers({
      accept: "application/json",
      "x-forwarded-for": freshIp(),
      "user-agent": "fixture-agent",
    });
    if (session) headers.set("cookie", `${SESSION_COOKIE}=${session.token}`);
    return accountRoute(
      new Request("http://localhost:3000/api/auth/account", { method: "POST", headers, body: form }),
    );
  }

  it("refuses a caller who is not signed in", async () => {
    const response = await postEmail(null, {
      currentPassword: "whatever-password-12",
      newEmail: fixtureEmail("route-anon"),
    });
    expect(response.status).toBe(401);
  });

  it("refuses the submission without the session's security token", async () => {
    const { session } = await signedIn("route-no-token");
    const response = await postEmail(
      session,
      {
        currentPassword: "fixture-correct-horse-1",
        newEmail: fixtureEmail("route-no-token-target"),
      },
      { sendToken: false },
    );
    expect(response.status).toBe(403);
    // The real session is still alive after a forged request.
    expect(await resolvePrincipal(session.token)).not.toBeNull();
  });

  it("moves the address, replaces every session and hands this browser a new one", async () => {
    const { account, session } = await signedIn("route-move");
    const target = fixtureEmail("route-target");
    const otherDevice = await createSession(account.userId, {
      ipHash: hashIp(freshIp()) ?? "unknown",
      userAgent: "fixture-other-device",
    });

    const response = await postEmail(session, {
      currentPassword: account.password,
      newEmail: target,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, emailChanged: true, email: target });

    expect((await userRow(account.userId)).email).toBe(target);
    expect(await resolvePrincipal(session.token)).toBeNull();
    expect(await resolvePrincipal(otherDevice.token)).toBeNull();

    const issued = response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))
      ?.split(";")[0]
      ?.split("=")
      .slice(1)
      .join("=");
    expect(issued).toBeTruthy();
    expect((await resolvePrincipal(issued!))?.userId).toBe(account.userId);
  });

  it("counts a wrong password and leaves the address where it was", async () => {
    const { account, session } = await signedIn("route-wrong");
    const response = await postEmail(session, {
      currentPassword: "not-the-password-here-1",
      newEmail: fixtureEmail("route-wrong-target"),
    });

    expect(response.status).toBe(401);
    expect((await userRow(account.userId)).email).toBe(account.email);
    const failures = await auditRowsFor(account.userId);
    expect(failures.some((entry) => entry.action === "auth.email_change_failed")).toBe(true);
  });
});

describe("the public recovery endpoint", () => {
  function postRecovery(identifier: string, token: string | null): Promise<Response> {
    const form = new FormData();
    if (token) form.set("csrfToken", token);
    form.set("identifier", identifier);
    const headers = new Headers({
      accept: "application/json",
      "x-forwarded-for": freshIp(),
      "user-agent": "fixture-agent",
    });
    if (token) headers.set("cookie", `${FORM_TOKEN_COOKIE}=${token}`);
    return recoveryRoute(
      new Request("http://localhost:3000/api/auth/recovery", { method: "POST", headers, body: form }),
    );
  }

  it("refuses a form with no anonymous token", async () => {
    const response = await postRecovery(`Fixture ${RUN}`, null);
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("csrf_failed");
  });

  it("answers an existing account and a stranger identically", async () => {
    const account = await createAccount("teacher", "route-recover");
    const known = await postRecovery(account.email, issueFormToken());
    const stranger = await postRecovery(`Stranger ${RUN}`, issueFormToken());

    expect(known.status).toBe(stranger.status);
    expect(await known.json()).toEqual(await stranger.json());
  });

  it("refuses a blank identifier instead of writing a useless queue entry", async () => {
    const response = await postRecovery("  ", issueFormToken());
    expect(response.status).toBe(422);
    expect((await response.json()).error.fields.identifier).toBeTruthy();
  });
});

describe("where a sign-in lands", () => {
  function signIn(body: Record<string, string>): Promise<Response> {
    return signInRoute(
      new Request("http://localhost:3000/api/auth/session", {
        method: "POST",
        headers: new Headers({
          "content-type": "application/json",
          "x-forwarded-for": freshIp(),
          "user-agent": "fixture-agent",
        }),
        body: JSON.stringify(body),
      }),
    );
  }

  it("sends a teacher to the teacher area and everyone else to the portal", async () => {
    const teacher = await createAccount("teacher", "landing-teacher");
    const office = await createAccount("office_staff", "landing-office");

    const teacherResponse = await signIn({ email: teacher.email, password: teacher.password });
    const officeResponse = await signIn({ email: office.email, password: office.password });

    expect((await teacherResponse.json()).redirectTo).toBe("/teacher");
    expect((await officeResponse.json()).redirectTo).toBe("/portal");
  });

  it("honours a page on this site, and refuses an address on another one", async () => {
    const teacher = await createAccount("teacher", "landing-next");

    const inside = await signIn({
      email: teacher.email,
      password: teacher.password,
      next: "/portal/account",
    });
    expect((await inside.json()).redirectTo).toBe("/portal/account");

    const elsewhere = await signIn({
      email: teacher.email,
      password: teacher.password,
      next: "//evil.example/signin",
    });
    expect((await elsewhere.json()).redirectTo).toBe("/teacher");
  });
});

describe("a revoked session", () => {
  it("cannot be used after its account's password is reset", async () => {
    const account = await createAccount("teacher", "revoked-after-reset");
    const session = await createSession(account.userId, {
      ipHash: hashIp(freshIp()) ?? "unknown",
      userAgent: "fixture-agent",
    });
    expect(await resolvePrincipal(session.token)).not.toBeNull();

    await resetUserPassword(await adminPrincipal(), account.userId);
    expect(await resolvePrincipal(session.token)).toBeNull();

    // Signing out an already revoked session stays harmless.
    await revokeSession(session.sessionId, "signed_out");
    expect(await resolvePrincipal(session.token)).toBeNull();
  });

  it("still mints a token the account can use for its own next request", async () => {
    const account = await createAccount("teacher", "csrf-family");
    const first = await createSession(account.userId, { ipHash: hashIp(freshIp()) ?? "unknown", userAgent: "a" });
    const second = await createSession(account.userId, { ipHash: hashIp(freshIp()) ?? "unknown", userAgent: "b" });

    expect(makeCsrfToken(first.sessionId)).not.toBe(makeCsrfToken(second.sessionId));
  });
});
