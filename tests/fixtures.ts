import { randomUUID } from "node:crypto";
import { findDoc, insertDoc, insertMany } from "@/server/db/mongo/repository";
import { hashPassword } from "@/server/auth/passwords";

/**
 * Fixtures for the integration suites.
 *
 * These are deliberately *test* rows with machine-generated addresses, created
 * inside the throwaway `mcv_test` database — not sample data pretending to be
 * the school's. Nothing here asserts a fact about Mongal Chandra Vidyapith: the
 * names are `Fixture Pupil One` and similar, so a leaked screenshot of a test
 * run could never be mistaken for a real record.
 */

const RUN = randomUUID().slice(0, 8);

export function fixtureEmail(label: string): string {
  return `${label}.${RUN}@fixture.invalid`;
}

/** `.invalid` is a reserved TLD that can never be delivered to. */
export const FIXTURE_PASSWORD = "fixture-correct-horse-1";

export async function createAccount(
  roleKey: string,
  label: string,
  options: { password?: string; status?: "active" | "pending" | "suspended" } = {},
): Promise<{ userId: string; email: string; password: string }> {
  const email = fixtureEmail(label);
  const password = options.password ?? FIXTURE_PASSWORD;
  const role = await findDoc("roles", { key: roleKey }, { projection: { id: 1 } });
  if (!role) throw new Error(`Fixture needs the "${roleKey}" role; run the seed.`);

  const account = await insertDoc("users", {
    email,
    passwordHash: await hashPassword(password),
    displayName: `Fixture ${label}`,
    status: options.status ?? "active",
  });

  await insertDoc("user_roles", { userId: account.id, roleId: role.id });
  return { userId: account.id, email, password };
}

export type SchoolFixture = {
  academicYearId: string;
  classAId: string;
  classBId: string;
  sectionAId: string;
  pupilA: { userId: string; studentId: string; email: string; password: string };
  pupilB: { studentId: string };
  teacher: { userId: string; staffId: string; email: string; password: string };
  guardian: { userId: string; email: string; password: string };
  admin: { userId: string; email: string; password: string };
  librarian: { userId: string; email: string; password: string };
};

/**
 * The smallest school that can prove the access rules: two classes, a teacher
 * assigned to one of them, a pupil in each, and a guardian linked to only one.
 */
export async function createSchoolFixture(): Promise<SchoolFixture> {
  const year = await findDoc("academic_years", { isCurrent: true }, { projection: { id: 1 } });
  if (!year) throw new Error("Fixture needs the seeded academic year.");

  const classA = await insertDoc("classes", {
    name: `Fixture Class A ${RUN}`,
    shortName: "A",
    orderNo: 1,
  });
  const classB = await insertDoc("classes", {
    name: `Fixture Class B ${RUN}`,
    shortName: "B",
    orderNo: 2,
  });
  const sectionA = await insertDoc("sections", { classId: classA.id, name: "1" });

  const designation = await insertDoc("designations", { title: `Fixture Teacher ${RUN}` });

  const admin = await createAccount("super_admin", "admin");
  const librarian = await createAccount("librarian", "librarian");
  const teacherAccount = await createAccount("teacher", "teacher");
  const guardianAccount = await createAccount("parent", "guardian");
  const pupilAccount = await createAccount("student", "pupil-a");

  const staff = await insertDoc("staff_members", {
    userId: teacherAccount.userId,
    employeeCode: `FIX-${RUN}-T`,
    firstName: "Fixture",
    lastName: "Teacher",
    designationId: designation.id,
  });

  await insertDoc("teaching_assignments", {
    staffId: staff.id,
    classId: classA.id,
    academicYearId: year.id,
    kind: "class_teacher",
  });

  const pupilA = await insertDoc("students", {
    userId: pupilAccount.userId,
    admissionNumber: `FIX-${RUN}-P1`,
    firstName: "Fixture",
    lastName: "Pupil One",
    classId: classA.id,
    sectionId: sectionA.id,
    academicYearId: year.id,
  });

  const pupilB = await insertDoc("students", {
    admissionNumber: `FIX-${RUN}-P2`,
    firstName: "Fixture",
    lastName: "Pupil Two",
    classId: classB.id,
    academicYearId: year.id,
  });

  await insertDoc("enrolments", {
    studentId: pupilA.id,
    academicYearId: year.id,
    classId: classA.id,
    status: "active",
  });

  const guardian = await insertDoc("guardians", {
    userId: guardianAccount.userId,
    firstName: "Fixture",
    lastName: "Guardian",
    relation: "Guardian",
    phone: "+000000000000",
  });

  await insertDoc("student_guardians", {
    studentId: pupilA.id,
    guardianId: guardian.id,
    isPrimary: true,
  });

  // The link that decides what a parent can see, and a pupil's own access.
  await insertMany("access_links", [
    { userId: guardianAccount.userId, studentId: pupilA.id, relation: "guardian" },
    { userId: pupilAccount.userId, studentId: pupilA.id, relation: "self" },
  ]);

  return {
    academicYearId: year.id,
    classAId: classA.id,
    classBId: classB.id,
    sectionAId: sectionA.id,
    pupilA: { ...pupilAccount, studentId: pupilA.id },
    pupilB: { studentId: pupilB.id },
    teacher: { ...teacherAccount, staffId: staff.id },
    guardian: guardianAccount,
    admin,
    librarian,
  };
}
