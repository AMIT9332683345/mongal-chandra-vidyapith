/**
 * The database errors the services above need to react to.
 *
 * Postgres signalled these with SQLSTATE codes; the MongoDB driver reports code
 * 11000 for a duplicate key and 121 for a schema-validation failure, and has no
 * equivalent of a foreign-key violation at all — that rule is enforced here, so
 * it needs a name.
 */

export class UniqueViolation extends Error {
  constructor(
    readonly collection: string,
    readonly index: string,
    readonly fields: string[],
  ) {
    super(`duplicate value for ${collection}.${index}`);
    this.name = "UniqueViolation";
  }
}

export class ForeignKeyViolation extends Error {
  constructor(
    readonly collection: string,
    readonly field: string,
    readonly referenced: string,
    readonly value: string,
  ) {
    super(`no ${referenced} document has id ${value}`);
    this.name = "ForeignKeyViolation";
  }
}

/** A `$jsonSchema` validator or an `$expr` cross-field rule refused the write. */
export class ConstraintViolation extends Error {
  constructor(
    readonly collection: string,
    readonly detail: string,
  ) {
    super(`${collection}: ${detail}`);
    this.name = "ConstraintViolation";
  }
}

/**
 * Multi-document transactions need a replica set. Atlas clusters are always
 * replica sets, and the local development server is started as one, so this is
 * only reachable when someone points the app at a bare standalone `mongod`.
 */
export class TransactionsUnavailable extends Error {
  constructor(detail: string) {
    super(
      `This deployment cannot commit related writes together (${detail}). ` +
        `Use an Atlas replica set or start the local server with --replSet.`,
    );
    this.name = "TransactionsUnavailable";
  }
}
