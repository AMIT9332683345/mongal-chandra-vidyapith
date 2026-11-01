import { findDoc, findDocs } from "@/server/db/mongo/repository";
import { AuthorizationError, principalHas, type Principal } from "./session";

/**
 * Row-level scope.
 *
 * A permission answers "may this role read marks at all". It cannot answer
 * "whose marks". That second question is settled here, and only here, so the
 * rules "a parent sees only their own children" and "a teacher acts only on
 * their assigned classes" each have one implementation instead of one per
 * endpoint.
 *
 * Scope is driven by permission keys, not by hardcoded role names: a school
 * that grants `student.view_any` to a new custom role gets school-wide reach
 * without a code change.
 *
 * Every function returns identifiers, never rows — callers plug them into
 * their own query and keep their own filtering, pagination and joins.
 */

/** One linked pupil. */
type Link = { studentId: string };
type StudentRow = { id: string; classId?: string; leftAt?: Date };

/* -------------------------------------------------------------------------- */
/* Students                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Capabilities that reach a pupil through the class they are in, rather than
 * through a personal link: a teacher needs their class register, a parent does
 * not.
 */
const CLASS_SCOPED_STUDENT_VIEW = [
  "attendance.view_class",
  "marks.enter",
  "assignment.view.own_class",
  "exam.view.own_class",
];

/** Live access links from this account to pupils. */
async function linkedStudentIds(userId: string): Promise<Link[]> {
  const rows = await findDocs("access_links", { userId, active: true });
  return rows.map((row) => ({ studentId: row.studentId }));
}

/**
 * Student ids the principal may open, or "all" for school-wide reach.
 *
 * Linked accounts are the only path for a pupil's own login too: a student
 * account carries an `access_links` row with relation `self`. One code path,
 * one place to audit.
 */
export async function accessibleStudentIds(principal: Principal): Promise<string[] | "all"> {
  if (principalHas(principal, "student.view_any")) return "all";

  const ids = new Set<string>();

  if (principalHas(principal, "student.view.own")) {
    for (const link of await linkedStudentIds(principal.userId)) ids.add(link.studentId);
  }

  if (CLASS_SCOPED_STUDENT_VIEW.some((permission) => principalHas(principal, permission))) {
    const classScope = await accessibleClassIds(principal);
    if (classScope === "all") return "all";
    if (classScope.length > 0) {
      // `leftAt: null` also matches pupils whose field was never written, which
      // is what an archived-row check means in a document store.
      const enrolled = await findDocs(
        "students",
        { classId: { $in: classScope }, leftAt: null },
        { projection: { id: 1 } },
      );
      for (const row of enrolled) ids.add(row.id);
    }
  }

  return [...ids];
}

/** Throws 403 unless the principal may open this one student. */
export async function assertStudentAccess(principal: Principal, studentId: string): Promise<void> {
  const scope = await accessibleStudentIds(principal);
  if (scope === "all") return;
  if (!scope.includes(studentId)) {
    // The same message whatever the reason, so this check cannot be used to
    // probe which admission numbers exist in the school.
    throw new AuthorizationError("That student is not linked to your account");
  }
}

/** Loads one student after checking scope. Returns null when not visible. */
export async function findAccessibleStudent(
  principal: Principal,
  studentId: string,
): Promise<StudentRow | null> {
  const scope = await accessibleStudentIds(principal);
  if (scope !== "all" && !scope.includes(studentId)) return null;
  const row = await findDoc("students", { id: studentId, leftAt: null });
  return row ? ({ id: row.id, classId: row.classId, leftAt: row.leftAt } as StudentRow) : null;
}

/**
 * The visible subset of a batch of student ids.
 * Bulk endpoints (attendance sheets, mark uploads) use this to drop rows
 * outside scope in one pass instead of one permission call per row.
 */
export async function visibleStudentIds(principal: Principal, candidateIds: string[]): Promise<string[]> {
  if (candidateIds.length === 0) return [];
  const scope = await accessibleStudentIds(principal);
  if (scope === "all") {
    const rows = await findDocs("students", { id: { $in: candidateIds } }, { projection: { id: 1 } });
    return rows.map((row) => row.id);
  }
  const allowed = new Set(scope);
  return candidateIds.filter((id) => allowed.has(id));
}

export async function isLinkedStudent(principal: Principal, studentId: string): Promise<boolean> {
  const link = await findDoc("access_links", {
    userId: principal.userId,
    studentId,
    active: true,
  });
  return link !== null;
}

/* -------------------------------------------------------------------------- */
/* Classes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Class ids the principal may act on, or "all" for school-wide reach.
 *
 * Three narrow sources: a role grant that names a class (how an admission
 * officer or a coordinator is limited); the staff member's live teaching
 * assignments; and, for a pupil or a guardian, the class their linked student
 * actually belongs to — which is how a family sees a timetable without being
 * given the whole school.
 */
export async function accessibleClassIds(principal: Principal): Promise<string[] | "all"> {
  if (principalHas(principal, "student.view_any")) return "all";

  const scoped = await findDocs(
    "user_roles",
    { userId: principal.userId, active: true },
    { projection: { classId: 1 } },
  );

  // The teacher path used to be a join; it is two indexed reads instead,
  // because a staff member's own row is what ties the login to a classroom.
  const staffRows = await findDocs(
    "staff_members",
    { userId: principal.userId, employmentStatus: "active" },
    { projection: { id: 1 } },
  );
  const taught =
    staffRows.length === 0
      ? []
      : await findDocs(
          "teaching_assignments",
          { staffId: { $in: staffRows.map((staff) => staff.id) }, active: true },
          { projection: { classId: 1 } },
        );

  const links = await linkedStudentIds(principal.userId);
  const linkedStudents =
    links.length === 0
      ? []
      : await findDocs(
          "students",
          { id: { $in: links.map((link) => link.studentId) } },
          { projection: { classId: 1 } },
        );

  const ids = new Set<string>();
  for (const row of [...scoped, ...taught, ...linkedStudents]) {
    const classId = (row as { classId?: string }).classId;
    if (classId) ids.add(classId);
  }
  return [...ids];
}

/** Throws unless the principal may act on this class. */
export async function assertClassAccess(principal: Principal, classId: string): Promise<void> {
  const scope = await accessibleClassIds(principal);
  if (scope === "all" || scope.includes(classId)) return;
  throw new AuthorizationError("That class is outside your assigned scope");
}

/**
 * Filters a client-supplied class id list down to what the principal owns.
 * Used by routes that accept classIds in a body: the values are checked
 * against scope before any of them reaches a query.
 */
export async function filterAccessibleClassIds(
  principal: Principal,
  classIds: string[],
): Promise<string[]> {
  if (classIds.length === 0) return [];
  const scope = await accessibleClassIds(principal);
  if (scope === "all") return classIds;
  const allowed = new Set(scope);
  return classIds.filter((id) => allowed.has(id));
}

/** Class names for a scope, for a dashboard's "your classes" header. */
export async function accessibleClasses(principal: Principal) {
  const scope = await accessibleClassIds(principal);
  const filter = scope === "all" ? { active: true } : { id: { $in: scope }, active: true };
  if (scope !== "all" && scope.length === 0) return [];
  const rows = await findDocs("classes", filter, { projection: { id: 1, name: 1 } });
  return rows.map((row) => ({ id: row.id, name: row.name }));
}
