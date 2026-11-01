import type { Document } from "mongodb";

/**
 * Rules the generated validators cannot express.
 *
 * The relational schema kept these in Postgres: CHECK constraints across two
 * columns, partial unique indexes ("only one academic year may be current",
 * "admission numbers must be unique when present"), and the `updated_at`
 * trigger. `$jsonSchema` covers shape, not relationships between fields, so
 * those arrive here as `$expr` validators and `partialFilterExpression` indexes
 * and are enforced by the server on every insert and update.
 *
 * Money columns are stored as decimal strings, the same way the SQL `numeric`
 * columns arrived as strings, so comparisons convert before ordering — a
 * lexicographic read would call "9.00" larger than "10.00".
 */

/**
 * A rule that must skip a column the document does not carry.
 *
 * Postgres read an absent column as NULL and every CHECK translated from it is
 * written to tolerate NULL. `$expr` is stricter: a field that is not on the
 * document resolves to *missing*, which compares as its own type — lower than
 * null, and far below a date — so `a <= b` is answered "false" rather than "not
 * my business" and the write is refused. `$ifNull` folds the two shapes back
 * together, so "omitted" satisfies the same guard as "explicitly null".
 */
const readNull = (field: string): Document => ({ $ifNull: [`$${field}`, null] });

/** The column is absent or null, so the rule below does not apply. */
const isNull = (field: string): Document => ({ $eq: [readNull(field), null] });

/** The column holds a value. */
const isPresent = (field: string): Document => ({ $not: [isNull(field)] });

/** Null-tolerant: a document that omits the field is not refused by this rule. */
const num = (field: string): Document => ({ $toDouble: readNull(field) });

/** `a <= b` for two optional decimal-string columns. */
function ordered(a: string, b: string): Document {
  return {
    $or: [isNull(a), isNull(b), { $lte: [num(a), num(b)] }],
  };
}

/** `field >= bound` for an optional decimal-string column. */
function atLeast(field: string, bound: number): Document {
  return { $or: [isNull(field), { $gte: [num(field), bound] }] };
}

/** `field > bound` for an optional decimal-string column. */
function above(field: string, bound: number): Document {
  return { $or: [isNull(field), { $gt: [num(field), bound] }] };
}

/**
 * `a <= b` for two optional ISO date strings or two optional dates. BSON orders
 * both types against their own kind, and every row of a column stores one type,
 * so a single comparison covers the date and timestamp columns alike.
 */
function timeOrdered(a: string, b: string): Document {
  return {
    $or: [isNull(a), isNull(b), { $lte: [`$${a}`, `$${b}`] }],
  };
}

export type ExtraConstraint = {
  /** `$expr` documents ANDed into the collection validator. */
  checks?: Document[];
  /** Indexes the relational schema declared in SQL rather than in the table. */
  indexes?: (Document & { name: string })[];
};

export const extraConstraints: Record<string, ExtraConstraint> = {
  "academic_years": {
    checks: [timeOrdered("startDate", "endDate")],
    indexes: [
      {
        name: "academic_years_single_current",
        unique: true,
        key: { isCurrent: 1 },
        partialFilterExpression: { isCurrent: true },
      },
    ],
  },

  "admission_applications": {
    checks: [timeOrdered("submittedAt", "interviewScheduledAt")],
  },

  "book_fines": {
    checks: [atLeast("amount", 0)],
  },

  "book_loans": {
    checks: [
      {
        $or: [
          { $and: [isPresent("studentId"), isNull("staffId")] },
          { $and: [isNull("studentId"), isPresent("staffId")] },
        ],
      },
    ],
  },

  "events": {
    checks: [
      timeOrdered("startsAt", "endsAt"),
      {
        $or: [isNull("registrationOpensAt"), isNull("registrationClosesAt"), { $lte: ["$registrationOpensAt", "$registrationClosesAt"] }],
      },
    ],
  },

  "exam_schedules": {
    checks: [
      { $or: [isNull("maxMarks"), above("maxMarks", 0)] },
      {
        $or: [isNull("passMarks"), { $and: [atLeast("passMarks", 0), ordered("passMarks", "maxMarks")] }],
      },
      { $or: [isNull("internalMaxMarks"), atLeast("internalMaxMarks", 0)] },
    ],
  },

  "exams": {
    checks: [timeOrdered("startDate", "endDate")],
  },

  "fee_invoice_lines": {
    checks: [above("amount", 0)],
  },

  "fee_invoices": {
    checks: [
      atLeast("subtotal", 0),
      atLeast("concessionAmount", 0),
      atLeast("amountDue", 0),
      atLeast("amountPaid", 0),
      atLeast("balance", 0),
      ordered("amountPaid", "amountDue"),
    ],
  },

  "fee_payments": {
    checks: [above("amount", 0)],
  },

  "fee_refunds": {
    checks: [above("amount", 0)],
  },

  "fee_structures": {
    checks: [atLeast("amount", 0)],
  },

  "grade_bands": {
    checks: [
      { $or: [isNull("minPercent"), { $gte: ["$minPercent", 0] }] },
      { $or: [isNull("minPercent"), { $lte: ["$minPercent", 100] }] },
      {
        $or: [
          isNull("maxPercent"),
          { $and: [{ $gt: ["$maxPercent", readNull("minPercent")] }, { $lte: ["$maxPercent", 100] }] },
        ],
      },
    ],
  },

  "holidays": {
    checks: [timeOrdered("startDate", "endDate")],
  },

  "leave_requests": {
    checks: [timeOrdered("fromDate", "toDate")],
  },

  "marks": {
    checks: [
      { $or: [isNull("theoryMarks"), { $gte: ["$theoryMarks", 0] }] },
      { $or: [isNull("internalMarks"), { $gte: ["$internalMarks", 0] }] },
      { $or: [isNull("totalMarks"), { $gte: ["$totalMarks", 0] }] },
    ],
  },

  "report_cards": {
    checks: [
      {
        $or: [isNull("percentage"), { $and: [{ $gte: ["$percentage", 0] }, { $lte: ["$percentage", 100] }] }],
      },
    ],
  },

  "students": {
    checks: [timeOrdered("joinedAt", "leftAt")],
    // No index here: the relational schema already declared
    // `unique (admission_number)` with the same "when present" reading, which the
    // generator translated. A second unique index on one key is refused by the
    // server, so this rule lives in exactly one place.
  },

  "timetable_slots": {
    checks: [
      { $or: [isNull("weekday"), { $and: [{ $gte: ["$weekday", 0] }, { $lte: ["$weekday", 6] }] }] },
      { $or: [isNull("periodNo"), { $gt: ["$periodNo", 0] }] },
    ],
  },
};

