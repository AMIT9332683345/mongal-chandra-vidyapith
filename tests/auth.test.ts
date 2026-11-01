import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { MongoClient } from "mongodb";
import { findDoc, findDocs, insertDoc } from "@/server/db/mongo/repository";
import { env } from "@/server/config/env";
import {
  authenticate,
  normalizeEmail,
  GENERIC_LOGIN_FAILURE,
} from "@/server/auth/login";
import {
  checkPasswordStrength,
  hashPassword,
  needsRehash,
  verifyPassword,
} from "@/server/auth/passwords";
import {
  createSession,
  hashIp,
  hashToken,
  loadGrants,
  makeCsrfToken,
  principalHas,
  revokeSession,
  type Principal,
} from "@/server/auth/session";
import { expandGrants, PERMISSION_CATALOGUE, ROLE_DEFINITIONS } from "@/server/auth/permissions";
import {
  accessibleClassIds,
  accessibleStudentIds,
  assertClassAccess,
  assertStudentAccess,
} from "@/server/auth/scope";
import { createSchoolFixture, fixtureEmail, FIXTURE_PASSWORD, type SchoolFixture } from "./fixtures";
import { testDatabaseName } from "./global-setup";

/**
 * The backend's own rules, tested against the real database.
 *
 * These suites cover the claims that must not be assumed: that a wrong password
 * and an unknown address are indistinguishable, that repeated failure actually
 * locks an account, that a parent's reach is only their linked children, that
 * one role cannot act inside another teacher's class, and that records live on
 * disk rather than in process memory.
 */

const catalogueKeys = new Set(PERMISSION_CATALOGUE.map((permission) => permission.key));

/** Shared across the suites in this file; the database is rebuilt per run. */
const school: { value?: SchoolFixture } = {};

beforeAll(async () => {
  school.value = await createSchoolFixture();
});

const fixture = () => {
  if (!school.value) throw new Error("Fixture not created yet.");
  return school.value;
};

/** A principal built the way the middleware builds one, from real grants. */
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

function manualPrincipal(roleKeys: string[], grants: string[]): Principal {
  return {
    userId: "manual",
    email: fixtureEmail("manual"),
    displayName: "Manual principal",
    mustChangePassword: false,
    sessionId: "manual-session",
    roleKeys,
    grants,
  };
}

describe("password storage", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const stored = await hashPassword(FIXTURE_PASSWORD);
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword(FIXTURE_PASSWORD, stored)).toBe(true);
    expect(await verifyPassword(`${FIXTURE_PASSWORD}x`, stored)).toBe(false);
  });

  it("salts, so the same password produces a different stored value", async () => {
    expect(await hashPassword(FIXTURE_PASSWORD)).not.toBe(await hashPassword(FIXTURE_PASSWORD));
  });

  it("treats a corrupt stored hash as a wrong password rather than an error", async () => {
    await expect(verifyPassword("anything", "not-a-scrypt-hash")).resolves.toBe(false);
  });

  it("flags a weaker hash for re-hash but still verifies it", async () => {
    const stored = await hashPassword(FIXTURE_PASSWORD);
    expect(needsRehash(stored)).toBe(false);
    const weakened = stored.replace(/^scrypt\$15/, "scrypt$14");
    expect(needsRehash(weakened)).toBe(true);
    expect(await verifyPassword(FIXTURE_PASSWORD, weakened)).toBe(true);
  });

  it("refuses short and trivially guessable passwords", () => {
    expect(checkPasswordStrength("short").ok).toBe(false);
    expect(checkPasswordStrength("password123").ok).toBe(false);
    expect(checkPasswordStrength("a-long-enough-phrase-7").ok).toBe(true);
  });
});

describe("permission matching", () => {
  it("does not let a view grant imply a publish grant", () => {
    expect(principalHas(manualPrincipal([], ["notice.view"]), "notice.view")).toBe(true);
    expect(principalHas(manualPrincipal([], ["notice.view"]), "notice.publish")).toBe(false);
  });

  it("expands a resource wildcard to that resource only", () => {
    const grants = ["notice.*"];
    expect(principalHas(manualPrincipal([], grants), "notice.publish")).toBe(true);
    expect(principalHas(manualPrincipal([], grants), "event.publish")).toBe(false);
  });

  it("gives the super administrator everything, including a permission added later", () => {
    expect(principalHas(manualPrincipal(["super_admin"], ["*"]), "anything.at.all")).toBe(true);
  });

  it("rejects a role definition naming a permission that does not exist", () => {
    expect(() => expandGrants(["notice.view"], catalogueKeys)).not.toThrow();
    expect(expandGrants(["student.view_any"], catalogueKeys)).toEqual(["student.view_any"]);
    expect(() => expandGrants(["student.does_not_exist"], catalogueKeys)).toThrow(
      /no known permission/,
    );
    // Every built-in role must expand cleanly, or the seed would be a no-op.
    for (const role of ROLE_DEFINITIONS) {
      expect(() => expandGrants(role.permissions, catalogueKeys)).not.toThrow();
    }
  });
});

describe("sign-in", () => {
  it("accepts the correct credentials", async () => {
    const result = await authenticate(fixture().teacher.email, fixture().teacher.password, {
      ip: "203.0.113.10",
      userAgent: "vitest",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.id).toBe(fixture().teacher.userId);
  });

  it("normalises the address so casing and stray spaces are not a second failure", () => {
    expect(normalizeEmail("  Office@Example.ORG ")).toBe("office@example.org");
  });

  it("gives nothing to enumerate: wrong password and unknown address read the same", async () => {
    const wrongPassword = await authenticate(fixture().admin.email, "definitely-not-it-12", {
      ip: "203.0.113.11",
    });
    const unknownEmail = await authenticate(fixtureEmail("nobody-here"), FIXTURE_PASSWORD, {
      ip: "203.0.113.11",
    });
    expect(wrongPassword.ok).toBe(false);
    expect(unknownEmail.ok).toBe(false);
    if (!wrongPassword.ok && !unknownEmail.ok) {
      expect(wrongPassword.message).toBe(GENERIC_LOGIN_FAILURE);
      expect(unknownEmail.message).toBe(GENERIC_LOGIN_FAILURE);
      expect(wrongPassword.code).toBe(unknownEmail.code);
    }
  });

  it("locks an account after the configured failures, even for the right password", async () => {
    const email = fixtureEmail("locked");
    const password = "a-long-enough-phrase-7";
    await insertDoc("users", {
      email,
      displayName: "Fixture Lockable",
      passwordHash: await hashPassword(password),
      status: "active",
    });

    for (let attempt = 0; attempt < env.LOGIN_MAX_ATTEMPTS; attempt += 1) {
      const failure = await authenticate(email, "the-wrong-password-1", { ip: "203.0.113.20" });
      expect(failure.ok).toBe(false);
    }

    const locked = await authenticate(email, password, { ip: "203.0.113.21" });
    expect(locked.ok).toBe(false);
    if (!locked.ok) {
      expect(locked.code).toBe("account_locked");
      expect(locked.retryAfterSeconds).toBeGreaterThan(0);
    }

    const stored = await findDoc("users", { email }, { projection: { lockedUntil: 1 } });
    expect(stored!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it("refuses an inactive account without leaking whether the password was right", async () => {
    const email = fixtureEmail("suspended");
    await insertDoc("users", {
      email,
      displayName: "Fixture Suspended",
      passwordHash: await hashPassword(FIXTURE_PASSWORD),
      status: "suspended",
    });
    const result = await authenticate(email, FIXTURE_PASSWORD, { ip: "203.0.113.30" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("account_not_active");
      expect(result.message).not.toBe(GENERIC_LOGIN_FAILURE);
    }
  });

  it("records failures in the audit trail", async () => {
    await authenticate(fixtureEmail("audited"), "whatever-1234567", { ip: "203.0.113.40" });
    const rows = await findDocs("audit_logs", { action: "auth.sign_in_failed" }, { projection: { id: 1 } });
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("sessions and CSRF", () => {
  async function makeAccount(label: string) {
    const account = await insertDoc("users", {
      email: fixtureEmail(label),
      displayName: `Fixture ${label}`,
      passwordHash: await hashPassword(FIXTURE_PASSWORD),
      status: "active",
    });
    return account.id;
  }

  it("stores only a hash of the cookie token", async () => {
    const userId = await makeAccount("session-holder");
    const session = await createSession(userId, { ipHash: "abc", userAgent: "vitest" });

    const stored = await findDoc("sessions", { userId }, { projection: { tokenHash: 1 } });

    expect(stored!.tokenHash).toBe(hashToken(session.token));
    expect(stored!.tokenHash).not.toBe(session.token);
    // The plaintext must not appear anywhere in the row, in any column order.
    expect(JSON.stringify(stored)).not.toContain(session.token);
  });

  it("binds a CSRF token to one session, so a captured token does not travel", () => {
    const first = makeCsrfToken("session-one");
    const second = makeCsrfToken("session-two");
    expect(first).toBe(makeCsrfToken("session-one"));
    expect(first).not.toBe(second);
  });

  it("hashes an address from the shared secret, so every instance counts the same client", () => {
    // The rate limits are counted in the database across cold starts and
    // replicas. A salt drawn from one process's memory would make each of them
    // hash the same address differently and quietly reset every throttle.
    const digest = hashIp("203.0.113.7");
    expect(digest).toBe(
      createHmac("sha256", env.IP_HASH_SECRET).update("203.0.113.7").digest("hex").slice(0, 32),
    );
    expect(digest).not.toContain("203.0.113.7");
    expect(hashIp("203.0.113.8")).not.toBe(digest);
    expect(hashIp(undefined)).toBeNull();
  });

  it("revokes a session so it cannot be replayed", async () => {
    const userId = await makeAccount("revoked-holder");
    const session = await createSession(userId, { ipHash: null, userAgent: "vitest" });
    await revokeSession(session.sessionId, "signed_out");

    const stored = await findDoc(
      "sessions",
      { id: session.sessionId },
      { projection: { revokedAt: 1, revokeReason: 1 } },
    );
    expect(stored!.revokedAt).toBeInstanceOf(Date);
    expect(stored!.revokeReason).toBe("signed_out");
  });

  it("resolves the grants an account actually holds", async () => {
    const grants = await loadGrants(fixture().teacher.userId);
    expect(grants.roleKeys).toContain("teacher");
    expect(grants.grants).toContain("attendance.mark");
    expect(grants.grants).not.toContain("fee.refund");
  });

  it("derives the super administrator's wildcard rather than storing it", async () => {
    const grants = await loadGrants(fixture().admin.userId);
    expect(grants.grants).toContain("*");
  });
});

describe("row-level scope", () => {
  it("gives a guardian only the children formally linked to the account", async () => {
    const guardian = await principalFor(fixture().guardian.userId);
    const scope = await accessibleStudentIds(guardian);
    expect(scope).toEqual([fixture().pupilA.studentId]);
    await expect(assertStudentAccess(guardian, fixture().pupilB.studentId)).rejects.toThrow(
      /not linked/,
    );
    await expect(assertStudentAccess(guardian, fixture().pupilA.studentId)).resolves.toBeUndefined();
  });

  it("gives a pupil their own record and their own class", async () => {
    const pupil = await principalFor(fixture().pupilA.userId);
    expect(await accessibleStudentIds(pupil)).toEqual([fixture().pupilA.studentId]);
    expect(await accessibleClassIds(pupil)).toEqual([fixture().classAId]);
  });

  it("confines a teacher to the class they are assigned to", async () => {
    const teacher = await principalFor(fixture().teacher.userId);
    expect(await accessibleClassIds(teacher)).toEqual([fixture().classAId]);

    const scope = await accessibleStudentIds(teacher);
    expect(scope).toContain(fixture().pupilA.studentId);
    // Pupil Two sits in Class B, which this teacher was never assigned to.
    expect(scope).not.toContain(fixture().pupilB.studentId);
    await expect(assertStudentAccess(teacher, fixture().pupilB.studentId)).rejects.toThrow();
  });

  it("gives a librarian no student records at all", async () => {
    const librarian = await principalFor(fixture().librarian.userId);
    expect(await accessibleStudentIds(librarian)).toEqual([]);
    expect(await accessibleClassIds(librarian)).toEqual([]);
  });

  it("gives the super administrator the whole school", async () => {
    const admin = await principalFor(fixture().admin.userId);
    expect(await accessibleStudentIds(admin)).toBe("all");
    expect(await accessibleClassIds(admin)).toBe("all");
  });

  it("does not let a role act in a class it was not granted", async () => {
    const teacher = await principalFor(fixture().teacher.userId);
    await expect(assertClassAccess(teacher, fixture().classBId)).rejects.toThrow(/outside your/);
    await expect(assertClassAccess(teacher, fixture().classAId)).resolves.toBeUndefined();
  });
});

describe("durability", () => {
  it("keeps a record visible to a brand-new connection, which is what a restart is", async () => {
    expect(env.MONGODB_DATABASE).toBe(testDatabaseName());

    const key = `test.persistence.${Date.now()}`;
    await insertDoc("school_settings", {
      key,
      label: "Persistence probe",
      group: "test",
      inputKind: "text",
      value: "written",
      isConfirmed: false,
    });

    // A second client is another process's worth of connections: nothing is
    // shared with the application's pool except the database on disk.
    const fresh = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 20_000 });
    await fresh.connect();
    try {
      const found = await fresh
        .db(env.MONGODB_DATABASE)
        .collection("school_settings")
        .findOne({ key });
      expect(found?.value).toBe("written");
    } finally {
      await fresh.close();
    }
  });

  it("enforces the rules the application layer is not trusted to enforce", async () => {
    // A duplicate login address is refused by the database, not by a form.
    const email = fixture().admin.email;
    await expect(
      insertDoc("users", {
        email,
        displayName: "Fixture Duplicate",
        passwordHash: "scrypt$15$8$1$AA==$AA=",
        status: "active",
      }),
    ).rejects.toThrow(/duplicate/i);
  });
});
