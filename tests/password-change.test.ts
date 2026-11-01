import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { findDoc, findDocs, insertDoc } from "@/server/db/mongo/repository";
import { POST as changePasswordRoute } from "@/app/api/auth/password/route";
import { changeOwnPassword } from "@/server/auth/change-password";
import { hashPassword, verifyPassword } from "@/server/auth/passwords";
import { SESSION_COOKIE, createSession, hashIp, resolvePrincipal, revokeSession } from "@/server/auth/session";
import { createAccount, fixtureEmail } from "./fixtures";

/**
 * Changing a password while signed in.
 *
 * This is the part of the account lifecycle that has to be proved rather than
 * assumed. The setup script issues a one-time password and says the platform
 * makes the holder change it, so the form that performs that change has to
 * refuse a forged submission, refuse a wrong current password, refuse a weak
 * replacement, sign every other device out afterwards, and never write the
 * secret down anywhere.
 */

const RUN = randomUUID().slice(0, 8);
/** The password the fixture accounts sign in with, and the replacement used below. */
const CURRENT = "fixture-issued-password-1";
const REPLACEMENT = "fixture-replacement-phrase-9";

/**
 * A different address per request, so one test cannot exhaust another's limit.
 * The digest of an address is now stable for the whole run, so these must be
 * genuinely unique rather than drawn at random from a small pool.
 */
let nextIp = 0;
function freshIp(): string {
  nextIp += 1;
  return `198.51.100.${(nextIp % 200) + 1}.${nextIp}.${RUN}`;
}

async function signedIn(label: string, status: "active" | "pending" | "suspended" = "active") {
  const account = await createAccount("teacher", label, { password: CURRENT, status });
  const session = await createSession(account.userId, {
    ipHash: hashIp(freshIp()),
    userAgent: "fixture-agent",
  });
  return { account, session };
}

/** Field names are the ones the page posts; anything absent is simply not sent. */
function changeForm(csrfToken: string | undefined, fields: Record<string, string | undefined> = {}): FormData {
  const form = new FormData();
  if (csrfToken !== undefined) form.set("csrfToken", csrfToken);
  form.set("currentPassword", CURRENT);
  form.set("newPassword", REPLACEMENT);
  form.set("confirmPassword", REPLACEMENT);
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) form.delete(key);
    else form.set(key, value);
  }
  return form;
}

function post(
  form: FormData,
  {
    token,
    ip = freshIp(),
    accept = "application/json",
    referer,
  }: { token?: string; ip?: string; accept?: string; referer?: string },
): Promise<Response> {
  const headers = new Headers({ accept, "x-forwarded-for": ip, "user-agent": "fixture-agent" });
  if (token) headers.set("cookie", `${SESSION_COOKIE}=${token}`);
  if (referer) headers.set("referer", referer);
  // The body is left to `Request`: it supplies the multipart boundary itself.
  return changePasswordRoute(
    new Request("http://localhost:3000/api/auth/password", { method: "POST", headers, body: form }),
  );
}

async function passwordRow(userId: string) {
  const row = await findDoc(
    "users",
    { id: userId },
    { projection: { passwordHash: 1, mustChangePassword: 1, passwordChangedAt: 1 } },
  );
  if (!row) throw new Error("Fixture account is not in the database.");
  return row;
}

function auditRowsFor(userId: string, action?: string) {
  return findDocs(
    "audit_logs",
    action ? { actorUserId: userId, action } : { actorUserId: userId },
    { projection: { action: 1, summary: 1, metadata: 1 }, sort: { createdAt: -1 } },
  );
}

async function sessionRow(sessionId: string) {
  const row = await findDoc("sessions", { id: sessionId }, { projection: { revokedAt: 1, revokeReason: 1 } });
  if (!row) throw new Error("Fixture session is not in the database.");
  return row;
}

describe("who is allowed to submit the form", () => {
  it("refuses someone who is not signed in", async () => {
    const response = await post(changeForm(undefined), {});
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("unauthenticated");
  });

  it("refuses a session that has already been signed out", async () => {
    const { session } = await signedIn("revoked");
    await revokeSession(session.sessionId, "signed_out");

    const response = await post(changeForm(session.csrfToken), { token: session.token });
    expect(response.status).toBe(401);
  });

  it("refuses a session whose account the school has suspended, and kills the session", async () => {
    const account = await createAccount("teacher", "suspended-direct", { password: CURRENT, status: "suspended" });
    const session = await createSession(account.userId, { ipHash: hashIp(freshIp()), userAgent: "fixture-agent" });

    const response = await post(changeForm(session.csrfToken), { token: session.token });
    expect(response.status).toBe(401);

    const row = await sessionRow(session.sessionId);
    expect(row.revokedAt).not.toBeNull();
    expect(row.revokeReason).toContain("account_status");
  });

  it("refuses the form without the security token", async () => {
    const { session } = await signedIn("no-token");
    const response = await post(changeForm(undefined), { token: session.token });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("csrf_failed");
  });

  it("refuses a token minted for somebody else's session", async () => {
    const intruder = await signedIn("intruder");
    const victim = await signedIn("victim");
    const before = await passwordRow(victim.account.userId);

    const response = await post(changeForm(intruder.session.csrfToken), { token: victim.session.token });
    expect(response.status).toBe(403);
    expect((await passwordRow(victim.account.userId)).passwordHash).toBe(before.passwordHash);
  });

  it("sends a browser without JavaScript back to the page with a code", async () => {
    const { session } = await signedIn("no-js");
    const response = await post(changeForm(undefined), {
      token: session.token,
      accept: "text/html",
      referer: "http://localhost:3000/portal",
    });

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/portal");
    expect(location.searchParams.get("form_error")).toBe("forbidden");
  });
});

describe("what the endpoint will not accept", () => {
  it("refuses a wrong current password and leaves the record untouched", async () => {
    const { account, session } = await signedIn("wrong-current");
    const before = await passwordRow(account.userId);

    const response = await post(changeForm(session.csrfToken, { currentPassword: "not-the-password-12" }), {
      token: session.token,
    });
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.message).toBe("That password is not correct.");
    expect(body.error.message).not.toMatch(/not found|no such|unknown/i);

    expect((await passwordRow(account.userId)).passwordHash).toBe(before.passwordHash);
  });

  it("refuses a replacement that does not meet the strength rule", async () => {
    const { account, session } = await signedIn("weak-new");
    const response = await post(
      changeForm(session.csrfToken, { newPassword: "short1", confirmPassword: "short1" }),
      { token: session.token },
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.fields.newPassword.join(" ")).toMatch(/12 characters/);
    expect(await verifyPassword(CURRENT, (await passwordRow(account.userId)).passwordHash)).toBe(true);
  });

  it("refuses the password the account is already using", async () => {
    const { session } = await signedIn("unchanged");
    const response = await post(
      changeForm(session.csrfToken, { newPassword: CURRENT, confirmPassword: CURRENT }),
      { token: session.token },
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error.fields.newPassword.join(" ")).toMatch(/different/);
  });

  it("refuses two halves that do not match", async () => {
    const { session } = await signedIn("mismatch");
    const response = await post(changeForm(session.csrfToken, { confirmPassword: "another-phrase-entirely-7" }), {
      token: session.token,
    });
    expect(response.status).toBe(422);
    expect((await response.json()).error.fields.confirmPassword).toBeTruthy();
  });

  it("refuses a blank field rather than trusting the page", async () => {
    const { session } = await signedIn("blank");
    const response = await post(changeForm(session.csrfToken, { newPassword: "", confirmPassword: "" }), {
      token: session.token,
    });
    expect(response.status).toBe(422);
  });

  it("stops a run of guesses, even when the password then happens to be right", async () => {
    const { account, session } = await signedIn("throttled");
    const ip = freshIp();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await post(changeForm(session.csrfToken, { currentPassword: `wrong-guess-${attempt}-12` }), {
        token: session.token,
        ip,
      });
      expect(response.status).toBe(401);
    }

    const blocked = await post(changeForm(session.csrfToken), { token: session.token, ip });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);

    // A different address is not punished for one machine's guessing.
    const elsewhere = await post(changeForm(session.csrfToken), { token: session.token, ip: freshIp() });
    expect(elsewhere.status).toBe(200);
    expect(await verifyPassword(REPLACEMENT, (await passwordRow(account.userId)).passwordHash)).toBe(true);
  });
});

describe("a password that is changed", () => {
  it("replaces the secret so the new one verifies and the old one does not", async () => {
    const { account, session } = await signedIn("rotation");
    const response = await post(changeForm(session.csrfToken), { token: session.token });
    expect(response.status).toBe(200);

    const row = await passwordRow(account.userId);
    expect(await verifyPassword(REPLACEMENT, row.passwordHash)).toBe(true);
    expect(await verifyPassword(CURRENT, row.passwordHash)).toBe(false);
  });

  it("clears the flag the setup script raised and records the moment", async () => {
    const issued = await insertDoc("users", {
      email: fixtureEmail("issued"),
      displayName: "Fixture Issued",
      passwordHash: await hashPassword(CURRENT),
      status: "active",
      mustChangePassword: true,
    });

    const session = await createSession(issued.id, { ipHash: hashIp(freshIp()), userAgent: "fixture-agent" });
    expect((await passwordRow(issued.id)).mustChangePassword).toBe(true);

    const response = await post(changeForm(session.csrfToken), { token: session.token });
    expect(response.status).toBe(200);

    const row = await passwordRow(issued.id);
    expect(row.mustChangePassword).toBe(false);
    expect(row.passwordChangedAt).toBeInstanceOf(Date);
  });

  it("signs every other device out and hands this one a fresh session", async () => {
    const { account, session } = await signedIn("everywhere");
    const otherDevice = await createSession(account.userId, {
      ipHash: hashIp(freshIp()),
      userAgent: "fixture-other-device",
    });

    const response = await post(changeForm(session.csrfToken), { token: session.token });
    expect(response.status).toBe(200);

    expect(await resolvePrincipal(otherDevice.token)).toBeNull();
    expect(await resolvePrincipal(session.token)).toBeNull();

    const issuedCookie = response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
    expect(issuedCookie).toBeTruthy();
    const replacementToken = issuedCookie?.split(";")[0]?.split("=").slice(1).join("=");
    expect(replacementToken).toBeTruthy();
    expect((await resolvePrincipal(replacementToken))?.userId).toBe(account.userId);
  });

  it("writes the new secret nowhere it can be read back", async () => {
    const { account, session } = await signedIn("leak-check");
    await post(changeForm(session.csrfToken), { token: session.token });

    const rows = await auditRowsFor(account.userId);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const text = `${row.summary ?? ""} ${JSON.stringify(row.metadata ?? {})}`;
      expect(text).not.toContain(REPLACEMENT);
      expect(text).not.toContain(CURRENT);
    }
    const stored = await findDoc("users", { id: account.userId }, { projection: { passwordHash: 1 } });
    expect(stored!.passwordHash.startsWith("scrypt$")).toBe(true);
    expect(stored!.passwordHash).not.toContain(REPLACEMENT);
  });

  it("records both the refusal and the change in the audit trail", async () => {
    const { account, session } = await signedIn("audited");
    await post(changeForm(session.csrfToken, { currentPassword: "definitely-not-it-99" }), { token: session.token });
    await post(changeForm(session.csrfToken), { token: session.token });

    const failures = await auditRowsFor(account.userId, "auth.password_change_failed");
    const successes = await auditRowsFor(account.userId, "auth.password_changed");
    expect(failures).toHaveLength(1);
    expect(successes).toHaveLength(1);
    expect(successes[0].summary).toBe("Password changed by the account holder");
  });
});

describe("the service on its own", () => {
  it("answers an account the school has not activated as a wrong password", async () => {
    const dormant = await insertDoc("users", {
      email: fixtureEmail("dormant"),
      displayName: "Fixture Dormant",
      passwordHash: await hashPassword(CURRENT),
      status: "pending",
    });

    const outcome = await changeOwnPassword({
      userId: dormant.id,
      currentPassword: CURRENT,
      newPassword: REPLACEMENT,
    });
    expect(outcome).toMatchObject({ ok: false, code: "wrong_password" });
  });

  it("leaves the row alone when it says no", async () => {
    const account = await createAccount("teacher", "refused", { password: CURRENT });
    const before = await passwordRow(account.userId);

    const outcome = await changeOwnPassword({
      userId: account.userId,
      currentPassword: "wrong-one-entirely-12",
      newPassword: REPLACEMENT,
    });
    expect(outcome.ok).toBe(false);
    expect((await passwordRow(account.userId)).passwordHash).toBe(before.passwordHash);
  });
});
