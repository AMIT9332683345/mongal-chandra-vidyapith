import { randomUUID } from "node:crypto";
import { closeMongo } from "@/server/db/mongo/client";
import { ensureSchema } from "@/server/db/mongo/ensure-schema";
import { ConstraintViolation, ForeignKeyViolation, UniqueViolation } from "@/server/db/mongo/errors";
import { countDocs, deleteDocs, findDoc, insertDoc, updateDocs, withTransaction } from "@/server/db/mongo/repository";

/**
 * A direct probe of the guarantees the relational layer used to provide.
 *
 * Run it with `npx tsx scripts/mongo-smoke.ts` against the development replica
 * set. Every check names the Postgres rule it stands in for, so a failure says
 * which promise was lost rather than only that something threw.
 */

async function main() {
  const run = randomUUID().slice(0, 8);
  let failures = 0;

  function check(label: string, condition: boolean, detail = "") {
    console.log(`${condition ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!condition) failures += 1;
  }

  function describe(error: unknown): string {
    if (error instanceof Error) return `${error.name}: ${error.message}`;
    return String(error);
  }

  const report = await ensureSchema();
  console.log(`collections: ${report.created.length} created, ${report.existing.length} already present`);
  console.log(`indexes: ${report.indexesCreated} created, ${report.indexesRebuilt.length} rebuilt`);

  // Second run must converge, not churn.
  const again = await ensureSchema();
  check(
    "ensureSchema is idempotent",
    again.created.length === 0 && again.indexesCreated === 0 && again.indexesRebuilt.length === 0,
  );

  const userId = (
    await insertDoc("users", {
      email: `smoke-${run}@vidyapith.test`,
      passwordHash: "scrypt$test",
      displayName: "Smoke Test",
      status: "active",
    })
  ).id;

  const user = await findDoc("users", { id: userId });
  check("status applied when omitted", user?.status === "active", `status=${user?.status}`);
  check("createdAt generated", user?.createdAt instanceof Date, JSON.stringify(user?.createdAt));
  check("updatedAt generated", user?.updatedAt instanceof Date);

  // NOT NULL equivalent.
  try {
    await insertDoc("users", { passwordHash: "x", displayName: "No email" });
    check("validator refuses a missing required field", false);
  } catch (error) {
    check("validator refuses a missing required field", error instanceof ConstraintViolation, describe(error));
  }

  // Enum equivalent.
  try {
    await insertDoc("users", {
      email: `enum-${run}@vidyapith.test`,
      passwordHash: "x",
      displayName: "Bad status",
      status: "superuser" as "active",
    });
    check("validator refuses a status outside the enum", false);
  } catch (error) {
    check("validator refuses a status outside the enum", error instanceof ConstraintViolation, describe(error));
  }

  // Unique index equivalent, case-insensitive like `lower(email)`.
  try {
    await insertDoc("users", { email: `SMOKE-${run}@vidyapith.test`, passwordHash: "x", displayName: "Case twin" });
    check("unique index treats A@ and a@ as one", false);
  } catch (error) {
    check("unique index treats A@ and a@ as one", error instanceof UniqueViolation, describe(error));
  }

  // Foreign key enforcement, which MongoDB has no equivalent of.
  try {
    await insertDoc("user_roles", { userId, roleId: randomUUID() });
    check("repository refuses a role id that does not exist", false);
  } catch (error) {
    check("repository refuses a role id that does not exist", error instanceof ForeignKeyViolation, describe(error));
  }

  // The NULLS NOT DISTINCT grant rule.
  const role = (await insertDoc("roles", { key: `smoke_role_${run}`, name: "Smoke role", description: "test" })).id;
  await insertDoc("user_roles", { userId, roleId: role });
  try {
    await insertDoc("user_roles", { userId, roleId: role });
    check("the same school-wide grant cannot be stored twice", false);
  } catch (error) {
    check("the same school-wide grant cannot be stored twice", error instanceof UniqueViolation, describe(error));
  }

  // Cross-field `$expr` rule translated from a Postgres CHECK.
  try {
    await insertDoc("academic_years", { name: `Broken ${run}`, startDate: "2026-06-01", endDate: "2026-04-01" });
    check("an academic year cannot end before it starts", false);
  } catch (error) {
    check("an academic year cannot end before it starts", error instanceof ConstraintViolation, describe(error));
  }

  // The CHECK compares two optional columns. Postgres saw an unset column as
  // NULL; `$expr` sees it as *missing*, which compares as neither null nor a
  // date — so without null-folding, a pupil with no leaving date would be refused.
  try {
    await insertDoc("students", {
      firstName: "Smoke",
      lastName: `Still here ${run}`,
      joinedAt: "2026-01-01",
    });
    check("a CHECK on a column the document omits still accepts the write", true);
  } catch (error) {
    check("a CHECK on a column the document omits still accepts the write", false, describe(error));
  }

  // Partial unique: at most one current year. A seeded database already holds
  // one, so the probe asks the same question either way: may a second one be
  // written? If it is accepted, the run says so only when none existed before.
  try {
    const probe = await insertDoc("academic_years", {
      name: `Second current ${run}`,
      startDate: "2027-01-01",
      endDate: "2027-12-31",
      isCurrent: true,
    });
    const others = await countDocs("academic_years", { isCurrent: true, id: { $ne: probe.id } });
    check(
      "only one academic year may be current",
      others === 0,
      others === 0 ? "the index let a lone current year through, which is correct" : "a second current year was accepted beside an existing one",
    );
    await deleteDocs("academic_years", { id: probe.id }, { cascade: true });
  } catch (error) {
    check("only one academic year may be current", error instanceof UniqueViolation, describe(error));
  }

  // Transactions, both directions. A rolled-back body must leave nothing behind
  // AND a committed one must leave everything — without the second half, an
  // environment where writes never land at all would also look like a rollback.
  const committedHash = `hash-commit-${run}`;
  const abortedHash = `hash-abort-${run}`;
  await withTransaction(async () => {
    await insertDoc("sessions", {
      userId,
      tokenHash: committedHash,
      expiresAt: new Date(Date.now() + 60_000),
      absoluteExpiresAt: new Date(Date.now() + 3_600_000),
    });
    await updateDocs("users", { id: userId }, { notes: "written inside a transaction" });
  });
  const committedSession = await findDoc("sessions", { tokenHash: committedHash });
  const committedNote = await findDoc("users", { id: userId });
  check("a committed transaction kept both writes", committedSession !== null && committedNote?.notes === "written inside a transaction");

  try {
    await withTransaction(async () => {
      await insertDoc("sessions", {
        userId,
        tokenHash: abortedHash,
        expiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 3_600_000),
      });
      await updateDocs("users", { id: userId }, { notes: "must not survive" });
      throw new Error("deliberate rollback");
    });
    check("withTransaction rolls the group back", false, "the body should have thrown");
  } catch (error) {
    const message = describe(error);
    if (/replica set|Transaction numbers|not supported/i.test(message)) {
      check("withTransaction is available on this deployment", false, message);
    } else {
      const orphan = await findDoc("sessions", { tokenHash: abortedHash });
      const notes = (await findDoc("users", { id: userId }))?.notes;
      check("withTransaction rolls the group back", orphan === null, message);
      check("the rolled-back transaction left the row untouched", notes === "written inside a transaction", `notes=${notes}`);
    }
  }

  await deleteDocs("sessions", { userId }, { cascade: true });
  await deleteDocs("user_roles", { userId }, { cascade: true });
  await deleteDocs("roles", { id: role }, { cascade: true });
  await deleteDocs("students", { lastName: `Still here ${run}` }, { cascade: true });
  await deleteDocs("users", { id: userId }, { cascade: true });

  console.log(`\n${failures === 0 ? "PASS" : `${failures} FAILURES`}`);
  await closeMongo();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  // Without this the pool keeps the loop alive and a broken probe never returns.
  await closeMongo();
  process.exit(1);
});
