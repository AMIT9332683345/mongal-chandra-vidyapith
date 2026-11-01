/**
 * The permission catalogue.
 *
 * Every protected operation in the platform is named here once. The seed writes
 * these rows into `permissions`; the eleven built-in roles are mapped to
 * subsets of them; and every route handler asks `hasPermission` before it
 * touches data. The frontend hides what a user cannot do, but that is only
 * tidiness — the check that matters is the one on the server.
 *
 * A role grant may end in `.*` to cover a whole resource, and `*` covers
 * everything. Wildcards exist so a super administrator's grant survives the
 * addition of a new permission without a migration.
 */

export type PermissionDefinition = {
  key: string;
  resource: string;
  action: string;
  description: string;
  /** High-risk capabilities are listed separately in the admin UI and always audited. */
  isSensitive: boolean;
};

/** [key, resource, action, description, isSensitive?] */
const CATALOGUE: Array<[string, string, string, string, boolean?]> = [
  // System and identity
  ["system.configure", "system", "configure", "Change platform-wide configuration", true],
  ["system.health.view", "system", "view", "View system health and job runs"],
  ["user.view", "user", "view", "View user accounts"],
  ["user.create", "user", "create", "Create user accounts", true],
  ["user.edit", "user", "edit", "Edit user accounts", true],
  ["user.deactivate", "user", "deactivate", "Suspend or close an account", true],
  ["user.password_reset", "user", "password_reset", "Issue a password reset", true],
  ["role.view", "role", "view", "View roles and their permissions"],
  ["role.assign", "role", "assign", "Grant or revoke a role for a user", true],
  ["role.edit", "role", "edit", "Change what a role is allowed to do", true],
  ["audit_log.view", "audit_log", "view", "Read the audit trail", true],
  ["audit_log.export", "audit_log", "export", "Export the audit trail", true],
  ["backup.manage", "backup", "manage", "Run and verify backups and restores", true],
  ["integration.edit", "integration", "edit", "Configure email, SMS and payment providers", true],
  ["module.edit", "module", "edit", "Turn school modules on and off", true],
  ["retention.edit", "retention", "edit", "Change how long records are kept", true],

  // Website content
  ["school_setting.view", "school_setting", "view", "View school settings"],
  ["school_setting.edit", "school_setting", "edit", "Change the school's official details", true],
  ["page.view", "page", "view", "View content pages including drafts"],
  ["page.create", "page", "create", "Create a content page"],
  ["page.edit", "page", "edit", "Edit a content page"],
  ["page.publish", "page", "publish", "Publish or unpublish a content page", true],
  ["homepage.edit", "homepage", "edit", "Edit the homepage sections"],
  ["homepage.publish", "homepage", "publish", "Show or hide homepage sections", true],
  ["navigation.edit", "navigation", "edit", "Edit header, footer and quick links"],
  ["faq.edit", "faq", "edit", "Edit frequently asked questions"],
  ["social_link.edit", "social_link", "edit", "Edit social media links"],

  // Notices
  ["notice.view", "notice", "view", "View notices including drafts"],
  ["notice.create", "notice", "create", "Draft a notice"],
  ["notice.edit", "notice", "edit", "Edit a notice"],
  ["notice.publish", "notice", "publish", "Publish a notice to the board", true],
  ["notice.delete", "notice", "delete", "Remove a notice", true],
  ["notice.category.edit", "notice", "category_edit", "Manage notice categories"],

  // Events
  ["event.view", "event", "view", "View events including drafts"],
  ["event.create", "event", "create", "Create an event"],
  ["event.edit", "event", "edit", "Edit an event"],
  ["event.publish", "event", "publish", "Publish, unpublish or archive an event", true],
  ["event.delete", "event", "delete", "Remove an event", true],
  ["event.category.edit", "event", "category_edit", "Manage event categories"],
  ["event.register", "event", "register", "Register participants for an event"],
  ["event.registration.manage", "event", "registration_manage", "Review and confirm registrations"],
  ["event.results.edit", "event", "results_edit", "Record results and highlights"],

  // Gallery
  ["gallery.view", "gallery", "view", "View albums including drafts"],
  ["gallery.edit", "gallery", "edit", "Create and edit albums and photographs"],
  ["gallery.publish", "gallery", "publish", "Publish an album to the public site", true],
  ["gallery.consent.verify", "gallery", "consent_verify", "Confirm photo consent for an album", true],

  // Facilities, achievements, history
  ["facility.edit", "facility", "edit", "Manage the facilities list"],
  ["achievement.edit", "achievement", "edit", "Manage achievements and results announcements"],
  ["milestone.edit", "milestone", "edit", "Manage the school history timeline"],

  // Documents
  ["document.view", "document", "view", "List documents the user is permitted to see"],
  ["document.upload", "document", "upload", "Upload a document"],
  ["document.download_public", "document", "download_public", "Download public documents"],
  ["document.download_restricted", "document", "download_restricted", "Download restricted documents", true],
  ["document.delete", "document", "delete", "Remove a document", true],

  // People
  ["student.view.own", "student", "view_own", "View the student records linked to this account"],
  ["student.view_any", "student", "view_any", "View any student record", true],
  ["student.create", "student", "create", "Add a student record", true],
  ["student.edit", "student", "edit", "Edit a student record", true],
  ["student.transfer", "student", "transfer", "Record a transfer, withdrawal or promotion", true],
  ["student.export", "student", "export", "Export student lists", true],
  ["guardian.view", "guardian", "view", "View guardian records"],
  ["guardian.edit", "guardian", "edit", "Create and edit guardian records"],
  ["guardian.link", "guardian", "link", "Link a guardian to a student", true],
  ["staff.view", "staff", "view", "View staff profiles"],
  ["staff.edit", "staff", "edit", "Create and edit staff profiles", true],
  ["staff.directory.publish", "staff", "directory_publish", "Decide what the public directory shows"],
  ["leave.request", "leave", "request", "Submit a leave request"],
  ["leave.approve", "leave", "approve", "Approve or refuse a leave request", true],

  // Academic structure
  ["academic_year.edit", "academic_year", "edit", "Configure academic years"],
  ["class.view", "class", "view", "View the list of classes and sections"],
  ["class.edit", "class", "edit", "Configure classes and sections"],
  ["subject.edit", "subject", "edit", "Configure subjects"],
  ["enrolment.view", "enrolment", "view", "View class enrolment lists"],
  ["enrolment.edit", "enrolment", "edit", "Enrol, promote or remove a student from a class"],
  ["timetable.view", "timetable", "view", "View timetables"],
  ["timetable.edit", "timetable", "edit", "Build and change timetables"],
  ["holiday.edit", "holiday", "edit", "Manage the holiday list"],

  // Coursework
  ["assignment.view.own_class", "assignment", "view_own_class", "View assignments for classes you teach"],
  ["assignment.create", "assignment", "create", "Set homework and assignments"],
  ["assignment.edit", "assignment", "edit", "Edit your own assignments"],
  ["assignment.review", "assignment", "review", "Review and mark submissions"],
  ["submission.create", "submission", "create", "Submit work"],
  ["study_material.view", "study_material", "view", "View study materials"],
  ["study_material.upload", "study_material", "upload", "Publish study materials"],

  // Attendance
  ["attendance.mark", "attendance", "mark", "Record daily attendance"],
  ["attendance.view.own", "attendance", "view_own", "View your own or your linked child's attendance"],
  ["attendance.view_class", "attendance", "view_class", "View attendance for classes you teach"],
  ["attendance.view_any", "attendance", "view_any", "View attendance across the school", true],
  ["attendance.correct_request", "attendance", "correct_request", "Request an attendance correction"],
  ["attendance.correct_approve", "attendance", "correct_approve", "Approve an attendance correction", true],
  ["attendance.export", "attendance", "export", "Export attendance reports"],

  // Examinations
  ["exam.edit", "exam", "edit", "Create examinations and schedules"],
  ["exam.view.own_class", "exam", "view_own_class", "View examinations for your classes"],
  ["marks.enter", "marks", "enter", "Enter marks for subjects you teach"],
  ["marks.verify", "marks", "verify", "Verify entered marks", true],
  ["marks.view.own", "marks", "view_own", "View your own or your linked child's marks"],
  ["marks.view_any", "marks", "view_any", "View marks across the school", true],
  ["marks.correct_request", "marks", "correct_request", "Request a mark correction"],
  ["marks.correct_approve", "marks", "correct_approve", "Approve a mark correction", true],
  ["grade_scale.edit", "grade_scale", "edit", "Configure grading scales and bands"],
  ["report_card.generate", "report_card", "generate", "Generate report cards"],
  ["report_card.publish", "report_card", "publish", "Release results to students and parents", true],
  ["report_card.view.own", "report_card", "view_own", "View your own or your linked child's report card"],

  // Fees
  ["fee_structure.edit", "fee_structure", "edit", "Configure fee categories and structures"],
  ["invoice.view.own", "invoice", "view_own", "View your own or your linked child's invoices"],
  ["invoice.generate", "invoice", "generate", "Raise fee invoices"],
  ["invoice.view_any", "invoice", "view_any", "View invoices across the school", true],
  ["payment.record", "payment", "record", "Record an offline payment", true],
  ["payment.confirm", "payment", "confirm", "Confirm a recorded payment", true],
  ["payment.view_any", "payment", "view_any", "View payment records across the school", true],
  ["payment.refund", "payment", "refund", "Record a refund", true],
  ["concession.grant", "concession", "grant", "Grant a fee concession", true],
  ["fee.report.export", "fee_report", "export", "Export financial reports", true],

  // Library
  ["book.edit", "book", "edit", "Manage the book catalogue"],
  ["book.view", "book", "view", "Search the catalogue"],
  ["loan.issue", "loan", "issue", "Issue and return books"],
  ["loan.view_own", "loan", "view_own", "View your own borrowing history"],
  ["loan.view_any", "loan", "view_any", "View any borrowing history", true],
  ["fine.manage", "fine", "manage", "Record, collect or waive a fine"],
  ["library_rule.edit", "library_rule", "edit", "Change borrowing rules"],
  ["library.report.export", "library_report", "export", "Export library reports"],

  // Admissions
  ["admission.apply", "admission", "apply", "Submit an admission application"],
  ["admission.track_own", "admission", "track_own", "Track an application by reference number"],
  ["admission.view", "admission", "view", "View submitted applications", true],
  ["admission.review", "admission", "review", "Review and verify application documents"],
  ["admission.decide", "admission", "decide", "Accept or reject an application", true],
  ["admission.schedule_interview", "admission", "schedule_interview", "Book an interview slot"],
  ["admission.report.export", "admission_report", "export", "Export admission reports"],

  // Front office
  ["enquiry.view", "enquiry", "view", "View contact and admission enquiries"],
  ["enquiry.respond", "enquiry", "respond", "Reply to an enquiry"],
  ["service_request.view", "service_request", "view", "View certificate and letter requests"],
  ["service_request.process", "service_request", "process", "Process and issue a document request"],
  ["appointment.view", "appointment", "view", "View the appointment book"],
  ["appointment.book", "appointment", "book", "Book or change an appointment"],

  // Communication
  ["notification.view_own", "notification", "view_own", "View your own notifications"],
  ["notification.manage_preferences", "notification", "manage_preferences", "Change your notification settings"],
  ["announcement.send", "announcement", "send", "Send an announcement to a chosen audience", true],
  ["message.use", "message", "use", "Send and read internal messages"],
  ["message.view_any", "message", "view_any", "Read any message thread", true],

  // Approvals and reporting
  ["content.approve", "content", "approve", "Approve content for publication", true],
  ["report.view_school", "report", "view_school", "View school-wide reports and analytics", true],
  ["report.export", "report", "export", "Export reports", true],
];

export const PERMISSION_CATALOGUE: PermissionDefinition[] = CATALOGUE.map(
  ([key, resource, action, description, isSensitive]) => ({
    key,
    resource,
    action,
    description,
    isSensitive: isSensitive ?? false,
  }),
);

export type PermissionKey = (typeof PERMISSION_CATALOGUE)[number]["key"];

/* -------------------------------------------------------------------------- */
/* Built-in roles                                                              */
/* -------------------------------------------------------------------------- */

export type RoleDefinition = {
  key: string;
  name: string;
  description: string;
  dashboardPath: string;
  sortOrder: number;
  /** Explicit grants plus `resource.*` and `*` wildcards. */
  permissions: string[];
};

/**
 * The eleven panels are genuinely different. A teacher's list contains no
 * wildcard that reaches another class's records; a parent's contains nothing
 * that could name another child; the accounts panel can move money but cannot
 * publish a notice; the librarian can see a book is overdue but not why a pupil
 * was absent.
 */
export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: "super_admin",
    name: "Super Administrator",
    description: "Runs the platform itself: configuration, roles, integrations, backups.",
    dashboardPath: "/portal",
    sortOrder: 10,
    permissions: ["*"],
  },
  {
    key: "school_admin",
    name: "School Administrator",
    description: "Owns the website, the school's records and day-to-day administration.",
    dashboardPath: "/portal",
    sortOrder: 20,
    permissions: [
      "school_setting.view", "school_setting.edit",
      "page.*", "homepage.*", "navigation.edit", "faq.edit", "social_link.edit",
      "notice.*", "event.*", "gallery.view", "gallery.edit", "gallery.publish", "gallery.consent.verify",
      "facility.edit", "achievement.edit", "milestone.edit",
      "document.*",
      "student.view_any", "student.create", "student.edit", "student.transfer", "student.export",
      "guardian.*", "staff.view", "staff.edit", "staff.directory.publish",
      "academic_year.edit", "class.edit", "subject.edit", "enrolment.*", "timetable.*", "holiday.edit",
      "attendance.view_any", "attendance.correct_approve", "attendance.export",
      "exam.edit", "marks.view_any", "marks.verify", "grade_scale.edit",
      "report_card.generate", "report_card.publish",
      "fee_structure.edit", "invoice.generate", "invoice.view_any", "payment.view_any",
      "concession.grant", "fee.report.export",
      "book.*", "loan.*", "fine.manage", "library_rule.edit", "library.report.export",
      "admission.view", "admission.review", "admission.decide", "admission.schedule_interview",
      "admission.report.export",
      "enquiry.*", "service_request.*", "appointment.*",
      "announcement.send", "message.use", "message.view_any",
      "content.approve", "report.view_school", "report.export",
      "user.view", "user.create", "user.edit", "user.password_reset",
      "role.view", "leave.approve", "notification.view_own", "notification.manage_preferences",
      "system.health.view", "module.edit",
    ],
  },
  {
    key: "principal",
    name: "Principal",
    description: "Sees the whole school, approves what goes public, and speaks to everyone.",
    dashboardPath: "/portal",
    sortOrder: 30,
    permissions: [
      "school_setting.view",
      "page.view", "homepage.edit",
      "notice.view", "notice.create", "notice.publish",
      "event.view", "event.create", "event.edit", "event.publish", "event.results.edit",
      "gallery.view", "gallery.publish",
      "student.view_any", "student.export", "guardian.view", "staff.view", "staff.edit",
      "enrolment.view", "timetable.view",
      "attendance.view_any", "attendance.export", "attendance.correct_approve",
      "exam.view.own_class", "marks.view_any", "report_card.generate", "report_card.publish",
      "invoice.view_any", "payment.view_any", "concession.grant", "fee.report.export",
      "admission.view", "admission.decide", "admission.report.export",
      "enquiry.view", "announcement.send", "message.use", "message.view_any",
      "content.approve", "report.view_school", "report.export", "audit_log.view",
      "notification.view_own", "notification.manage_preferences",
    ],
  },
  {
    key: "teacher",
    name: "Teacher",
    description: "Runs classes they are assigned to: attendance, work, marks, and parents of those classes.",
    dashboardPath: "/portal",
    sortOrder: 40,
    permissions: [
      "page.view",
      "notice.view", "notice.create",
      "event.view", "event.register", "event.results.edit",
      "document.view", "document.upload", "document.download_public",
      "student.view.own", "enrolment.view",
      "timetable.view", "timetable.edit",
      "assignment.view.own_class", "assignment.create", "assignment.edit", "assignment.review",
      "study_material.view", "study_material.upload",
      "attendance.mark", "attendance.view_class", "attendance.correct_request", "attendance.export",
      "exam.view.own_class", "marks.enter", "marks.correct_request",
      "report_card.view.own",
      "book.view", "loan.view_own",
      "announcement.send", "message.use",
      "notification.view_own", "notification.manage_preferences",
      "leave.request",
    ],
  },
  {
    key: "student",
    name: "Student",
    description: "One pupil's own academic life: timetable, work, attendance, results.",
    dashboardPath: "/portal",
    sortOrder: 50,
    permissions: [
      "notice.view", "event.view", "event.register",
      "gallery.view",
      "document.download_public",
      "student.view.own",
      "timetable.view",
      "assignment.view.own_class", "submission.create", "study_material.view",
      "attendance.view.own", "attendance.correct_request",
      "exam.view.own_class", "marks.view.own", "report_card.view.own",
      "invoice.view.own",
      "book.view", "loan.view_own",
      "message.use", "notification.view_own", "notification.manage_preferences",
    ],
  },
  {
    key: "parent",
    name: "Parent or Guardian",
    description: "The linked children only, and the school's communications about them.",
    dashboardPath: "/portal",
    sortOrder: 60,
    permissions: [
      "notice.view", "event.view", "event.register",
      "gallery.view",
      "document.download_public",
      "student.view.own",
      "timetable.view",
      "assignment.view.own_class", "study_material.view",
      "attendance.view.own", "attendance.correct_request",
      "exam.view.own_class", "marks.view.own", "report_card.view.own",
      "invoice.view.own",
      "book.view", "loan.view_own",
      "appointment.book", "service_request.view",
      "message.use", "notification.view_own", "notification.manage_preferences",
    ],
  },
  {
    key: "admission_staff",
    name: "Admission Staff",
    description: "The application pipeline end to end, without access to enrolled pupils' records.",
    dashboardPath: "/portal/admin/applications",
    sortOrder: 70,
    permissions: [
      "notice.view", "notice.create",
      "document.view", "document.upload", "document.download_public", "document.download_restricted",
      "admission.view", "admission.review", "admission.decide",
      "admission.schedule_interview", "admission.report.export",
      "student.create", "guardian.edit", "guardian.link",
      "enquiry.view", "enquiry.respond", "appointment.book",
      "class.view", "message.use",
      "notification.view_own", "notification.manage_preferences",
      "report.export",
    ],
  },
  {
    key: "accounts",
    name: "Accounts and Fees",
    description: "Money in and money out, with no route to academic or published content.",
    dashboardPath: "/portal",
    sortOrder: 80,
    permissions: [
      "student.view_any",
      "enrolment.view",
      "fee_structure.edit",
      "invoice.generate", "invoice.view_any",
      "payment.record", "payment.confirm", "payment.view_any", "payment.refund",
      "concession.grant", "fee.report.export",
      "document.view", "document.upload", "document.download_public",
      "notice.view",
      "enquiry.view", "message.use",
      "report.view_school", "report.export",
      "notification.view_own", "notification.manage_preferences",
    ],
  },
  {
    key: "librarian",
    name: "Librarian",
    description: "The collection and its circulation, and nothing else about a pupil's life.",
    dashboardPath: "/portal",
    sortOrder: 90,
    permissions: [
      "book.*", "loan.issue", "loan.view_any", "fine.manage", "library_rule.edit",
      "library.report.export",
      "student.view.own", "staff.view",
      "enrolment.view",
      "notice.view", "document.download_public",
      "message.use", "notification.view_own", "notification.manage_preferences",
    ],
  },
  {
    key: "event_coordinator",
    name: "Event Coordinator",
    description: "Programmes, registrations, albums and results, without reaching student records.",
    dashboardPath: "/portal/content/events",
    sortOrder: 100,
    permissions: [
      "event.*", "gallery.view", "gallery.edit", "gallery.publish",
      "notice.view", "notice.create", "notice.publish",
      "document.view", "document.upload", "document.download_public",
      "enrolment.view", "student.view.own",
      "announcement.send", "message.use",
      "report.export",
      "notification.view_own", "notification.manage_preferences",
    ],
  },
  {
    key: "office_staff",
    name: "Office Staff",
    description: "The front office: enquiries, visitors, certificates. No records beyond what a request names.",
    dashboardPath: "/portal/admin/enquiries",
    sortOrder: 110,
    permissions: [
      "enquiry.view", "enquiry.respond",
      "service_request.view", "service_request.process",
      "appointment.view", "appointment.book",
      "notice.view", "notice.create",
      "event.view",
      "student.view.own", "guardian.view",
      "document.view", "document.upload", "document.download_public",
      "message.use",
      "notification.view_own", "notification.manage_preferences",
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Matching                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Does a set of granted patterns cover a required permission?
 *
 * `*` matches everything, `resource.*` matches every action on one resource,
 * and a trailing `.view` grant does not imply `.edit`.
 */
export function grantedCovers(granted: string, required: string): boolean {
  if (granted === "*") return true;
  if (granted === required) return true;
  if (granted.endsWith(".*") && required.startsWith(`${granted.slice(0, -2)}.`)) return true;
  return false;
}

export function hasPermission(grants: Iterable<string>, required: string | undefined): boolean {
  if (!required) return true;
  for (const grant of grants) {
    if (grantedCovers(grant, required)) return true;
  }
  return false;
}

/**
 * Turns a role definition's patterns into concrete catalogue keys.
 *
 * Wildcards are a convenience for whoever writes the definition; the database
 * stores the expanded set, because `role_permissions` references real
 * permission keys and a pattern would be an unenforceable promise.
 *
 * Anything that matches no catalogue entry is an error rather than a silent
 * no-op — a typo in a grant list otherwise reads as a working permission.
 */
export function expandGrants(
  patterns: readonly string[],
  catalogueKeys: ReadonlySet<string> = new Set(PERMISSION_CATALOGUE.map((p) => p.key)),
): string[] {
  const expanded = new Set<string>();
  const unmatched: string[] = [];

  for (const pattern of patterns) {
    if (pattern === "*") {
      for (const key of catalogueKeys) expanded.add(key);
      continue;
    }
    let matched = false;
    for (const key of catalogueKeys) {
      if (grantedCovers(pattern, key)) {
        expanded.add(key);
        matched = true;
      }
    }
    if (!matched) unmatched.push(pattern);
  }

  if (unmatched.length > 0) {
    throw new Error(
      `Role grants name no known permission: ${unmatched.sort().join(", ")}. ` +
        `Check the spelling against PERMISSION_CATALOGUE.`,
    );
  }
  return [...expanded].sort();
}
