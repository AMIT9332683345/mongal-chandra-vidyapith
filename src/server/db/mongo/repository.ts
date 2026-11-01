import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  MongoServerError,
  type Collection,
  type CollationOptions,
  type Document,
  type Filter,
  type ClientSession,
} from "mongodb";
import { getDb } from "./client";
import { ConstraintViolation, ForeignKeyViolation, TransactionsUnavailable, UniqueViolation } from "./errors";
import { collectionSpecs, type CollectionName } from "./schema.generated";

/**
 * The repository layer.
 *
 * Postgres did four things a bare MongoDB collection does not: filled DEFAULT
 * values, kept `updated_at` fresh on every write, refused a foreign key that
 * pointed at a row which does not exist, and refused a delete whose dependents
 * were still there. Those jobs live here, driven by the generated specs, so a
 * service cannot skip them by reaching for the raw driver.
 *
 * Documents carry `id`; the database stores `_id`. The mapping happens on the
 * way in and the way out so no service code has to know which key MongoDB uses.
 */

type Spec = (typeof collectionSpecs)[CollectionName];
/** The document shape a collection stores, by collection name. */
export type DocOf<N extends CollectionName> = (typeof collectionSpecs)[N]["doc"];
type Stored = Document & { _id: string };

/**
 * A transaction's session travels through async context rather than an argument
 * list. A module-level variable would let one request's writes join another
 * request's open transaction, which is exactly the corruption a transaction is
 * here to prevent.
 */
const transactionScope = new AsyncLocalStorage<ClientSession>();

function sessionOption(): { session?: ClientSession } {
  const session = transactionScope.getStore();
  return session ? { session } : {};
}

function specFor(collection: CollectionName): Spec {
  return collectionSpecs[collection] as Spec;
}

function raw<N extends CollectionName>(collection: N): Collection<Stored> {
  return getDb().collection(collection) as unknown as Collection<Stored>;
}

function fromStored<Doc>(stored: Stored | null): Doc | null {
  if (!stored) return null;
  const { _id, ...rest } = stored;
  return { id: _id, ...rest } as Doc;
}

function toStoredFilter<Doc>(filter: FilterOf<Doc>): Filter<Stored> {
  const out: Document = {};
  for (const [key, value] of Object.entries(filter as Document)) {
    if (value === undefined) continue;
    out[key === "id" ? "_id" : key] = value;
  }
  return out as Filter<Stored>;
}

function toStoredSort(sort: Document | undefined): Document | undefined {
  if (!sort) return undefined;
  const out: Document = {};
  for (const [key, value] of Object.entries(sort)) out[key === "id" ? "_id" : key] = value;
  return out;
}

export type FindOptions = {
  sort?: Document;
  limit?: number;
  skip?: number;
  /** Fields to read, so a list query does not pull columns it will never show. */
  projection?: Document;
  collation?: CollationOptions;
};

/**
 * The collation the case-insensitive unique indexes are built with.
 *
 * Postgres compared `lower(email)`; MongoDB compares with a locale, and a query
 * only uses a collated index when it asks for the same collation. One constant,
 * so a lookup cannot silently stop matching its own index.
 */
export const CASE_INSENSITIVE: CollationOptions = { locale: "en", strength: 2 };

export type WriteOptions = { collation?: CollationOptions };

/**
 * A selection predicate. Either the exact value a field must hold or a MongoDB
 * operator object against it (`{ $in: [...] }`, `{ $gte: date }`, `{ $ne: x }`).
 * `null` is allowed because a missing column and an explicitly nulled one are
 * the same thing to MongoDB: `{ col: null }` matches documents without the field.
 *
 * The `$or` / `$and` / `$nor` forms are spelled out rather than left to `Document`
 * so a field name typed inside them is still checked against the collection.
 */
export type FilterOf<Doc> = {
  [K in keyof Doc]?: Doc[K] | Document | null;
} & {
  $or?: FilterOf<Doc>[];
  $and?: FilterOf<Doc>[];
  $nor?: FilterOf<Doc>[];
  $expr?: Document;
};

function driverFind(collection: CollectionName, filter: Document, options: FindOptions) {
  const projection = options.projection
    ? Object.fromEntries(
        Object.entries(options.projection).map(([key, value]) => [key === "id" ? "_id" : key, value]),
      )
    : undefined;
  return raw(collection).find(toStoredFilter(filter), {
    ...sessionOption(),
    sort: toStoredSort(options.sort),
    limit: options.limit,
    skip: options.skip,
    projection,
    ...(options.collation ? { collation: options.collation } : {}),
  });
}

function defaultValue(rule: unknown): unknown {
  if (rule && typeof rule === "object" && "generate" in rule) {
    const kind = (rule as { generate: string }).generate;
    return kind === "uuid" ? randomUUID() : new Date();
  }
  return rule;
}

/** Fills the columns Postgres defaulted, then proves every foreign key resolves. */
async function prepareInsert(collection: CollectionName, values: Document): Promise<Stored> {
  const spec = specFor(collection);
  const doc: Document = { ...values };

  for (const [field, rule] of Object.entries(spec.defaults ?? {})) {
    if (doc[field] === undefined) doc[field] = defaultValue(rule);
  }

  const id = typeof doc.id === "string" ? doc.id : randomUUID();
  delete doc.id;
  const stored = { _id: id, ...doc } as Stored;

  for (const key of spec.foreignKeys ?? []) {
    const value = doc[key.field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") {
      throw new ConstraintViolation(collection, `${key.field} must hold an id`);
    }
    // Usually the target's own id, but a grant points at the natural key
    // `permissions.key`, so checking `_id` there would reject every row.
    const storedKey = key.refField === "id" || key.refField === undefined ? "_id" : key.refField;
    const target = raw(key.ref as CollectionName);
    const found = await target.findOne({ [storedKey]: value } as Filter<Stored>, {
      ...sessionOption(),
      projection: { _id: 1 },
    });
    if (!found) throw new ForeignKeyViolation(collection, key.field, key.ref, value);
  }

  return stored;
}

/**
 * Names the field a validator rejected.
 *
 * MongoDB answers every schema-validation failure with the same five words,
 * "Document failed validation", and puts the reason in `errInfo`. Read from the
 * top that error is useless — 95 collections share one message — so the walk
 * below digs the property names and reasons back out for the log line.
 */
function validationDetail(error: MongoServerError): string {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const entry of node) walk(entry);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const propertyName = record.propertyName;
    if (typeof propertyName === "string") {
      const reason = Array.isArray(record.details)
        ? record.details
            .map((detail) => {
              const entry = (detail ?? {}) as Record<string, unknown>;
              return typeof entry.reason === "string" ? entry.reason : undefined;
            })
            .filter((text): text is string => Boolean(text))
            .join(", ")
        : "";
      found.push(reason ? `${propertyName} (${reason})` : propertyName);
      return;
    }
    const missing = record.missingProperties ?? record.missing;
    if (Array.isArray(missing)) {
      for (const field of missing) if (typeof field === "string") found.push(field);
    }
    for (const value of Object.values(record)) {
      if (value && typeof value === "object") walk(value);
    }
  };
  walk((error as { errInfo?: unknown }).errInfo);
  if (found.length > 0) return `rejected ${[...new Set(found)].join(", ")}`;
  const raw = JSON.stringify((error as { errInfo?: unknown }).errInfo ?? error.message);
  return `rejected by validation ${raw.slice(0, 300)}`;
}

/** Turns driver error codes back into the failures the services reason about. */
function translateError(collection: CollectionName, error: unknown): unknown {
  if (error instanceof MongoServerError) {
    if (error.code === 11000) {
      const indexName = /index:\s*(\S+)/.exec(error.message)?.[1] ?? "unknown";
      const index = (specFor(collection).indexes ?? []).find((entry) => entry.name === indexName);
      return new UniqueViolation(collection, indexName, Object.keys(index?.key ?? {}));
    }
    if (error.code === 121) return new ConstraintViolation(collection, validationDetail(error));
  }
  return error;
}

export async function insertDoc<N extends CollectionName>(
  collection: N,
  values: Partial<DocOf<N>>,
): Promise<DocOf<N>> {
  const stored = await prepareInsert(collection, values as Document);
  try {
    await raw(collection).insertOne(stored, sessionOption());
  } catch (error) {
    throw translateError(collection, error);
  }
  return fromStored<DocOf<N>>(stored) as DocOf<N>;
}

/**
 * Insert-or-update by a natural key — the `ON CONFLICT` the seed scripts used.
 *
 * `set` is what a rerun overwrites; `onInsert` is what only a first write gets.
 * Keeping them apart is what lets a re-seed refresh a label without touching an
 * answer a school has since typed into the same row. Both halves go through the
 * same default-filling and foreign-key checks as an ordinary insert.
 */
export async function upsertDoc<N extends CollectionName>(
  collection: N,
  key: FilterOf<DocOf<N>>,
  set: Partial<DocOf<N>>,
  onInsert: Partial<DocOf<N>> = {},
): Promise<void> {
  const stored = await prepareInsert(collection, {
    ...(key as Document),
    ...onInsert,
    ...(set as Document),
  });
  const { _id, ...fields } = stored;

  const updates = set as Document;
  const updateFields = Object.fromEntries(
    Object.entries(fields).filter(([name]) => name in updates),
  );
  const insertFields = Object.fromEntries(
    Object.entries(fields).filter(([name]) => !(name in updates)),
  );
  insertFields._id = _id;

  const change: Document = { $setOnInsert: insertFields };
  // An upsert with nothing to change on match is still a valid "insert if absent".
  if (Object.keys(updateFields).length > 0) change.$set = updateFields;

  try {
    await raw(collection).updateOne(toStoredFilter(key), change, {
      upsert: true,
      ...sessionOption(),
    });
  } catch (error) {
    throw translateError(collection, error);
  }
}

/** `ON CONFLICT DO NOTHING`: the row is created only when it is missing. */
export async function insertIfAbsent<N extends CollectionName>(
  collection: N,
  key: FilterOf<DocOf<N>>,
  values: Partial<DocOf<N>> = {},
): Promise<void> {
  await upsertDoc(collection, key, {}, values);
}

export async function insertMany<N extends CollectionName>(
  collection: N,
  rows: Partial<DocOf<N>>[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const stored: Stored[] = [];
  for (const row of rows) stored.push(await prepareInsert(collection, row as Document));
  try {
    const result = await raw(collection).insertMany(stored, { ordered: true, ...sessionOption() });
    return result.insertedCount;
  } catch (error) {
    throw translateError(collection, error);
  }
}

export async function findDoc<N extends CollectionName>(
  collection: N,
  filter: FilterOf<DocOf<N>>,
  options: FindOptions = {},
): Promise<DocOf<N> | null> {
  return fromStored<DocOf<N>>(await driverFind(collection, filter as Document, options).next());
}

export async function findDocById<N extends CollectionName>(
  collection: N,
  id: string,
): Promise<DocOf<N> | null> {
  return fromStored<DocOf<N>>(
    await raw(collection).findOne({ _id: id } as Filter<Stored>, sessionOption()),
  );
}

export async function findDocs<N extends CollectionName>(
  collection: N,
  filter: FilterOf<DocOf<N>>,
  options: FindOptions = {},
): Promise<DocOf<N>[]> {
  const rows = await driverFind(collection, filter as Document, options).toArray();
  return rows.map((row) => fromStored<DocOf<N>>(row) as DocOf<N>);
}

export async function countDocs<N extends CollectionName>(
  collection: N,
  filter: FilterOf<DocOf<N>>,
  options: WriteOptions = {},
): Promise<number> {
  return raw(collection).countDocuments(toStoredFilter(filter), {
    ...sessionOption(),
    ...(options.collation ? { collation: options.collation } : {}),
  });
}

export async function existsDoc<N extends CollectionName>(
  collection: N,
  filter: FilterOf<DocOf<N>>,
  options: WriteOptions = {},
): Promise<boolean> {
  return (await countDocs(collection, filter, options)) > 0;
}

/**
 * The values one field takes across the whole collection, decided by the server.
 *
 * For a filter list in an admin panel — a bounded set like the actions in the
 * audit trail — this is cheaper and honest in a way that reading the rows is not.
 */
export async function distinctValues<N extends CollectionName>(
  collection: N,
  field: keyof DocOf<N> & string,
): Promise<unknown[]> {
  return raw(collection).distinct(field, {}, sessionOption());
}

export type WriteResult = { matchedCount: number; modifiedCount: number };

function setClause<Doc>(set: Partial<Doc>): Document {
  const changes: Document = { ...(set as Document) };
  delete changes.id;
  return changes;
}

/** `$set`, plus the `updated_at` refresh the SQL trigger used to do. */
export async function updateDocs<N extends CollectionName>(
  collection: N,
  filter: FilterOf<DocOf<N>>,
  set: Partial<DocOf<N>>,
): Promise<WriteResult> {
  const changes = setClause(set);
  if ("updatedAt" in (specFor(collection).defaults ?? {})) changes.updatedAt = new Date();
  try {
    const result = await raw(collection).updateMany(toStoredFilter(filter), { $set: changes }, sessionOption());
    return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount };
  } catch (error) {
    throw translateError(collection, error);
  }
}

export async function updateOneDoc<N extends CollectionName>(
  collection: N,
  filter: FilterOf<DocOf<N>>,
  set: Partial<DocOf<N>>,
): Promise<WriteResult> {
  const changes = setClause(set);
  if ("updatedAt" in (specFor(collection).defaults ?? {})) changes.updatedAt = new Date();
  try {
    const result = await raw(collection).updateOne(toStoredFilter(filter), { $set: changes }, sessionOption());
    return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount };
  } catch (error) {
    throw translateError(collection, error);
  }
}

/**
 * `$set` with fields that may be cleared to null. `updateDocs` skips undefined,
 * which is what a partial update wants but not what a form save wants.
 */
export async function replaceDoc<N extends CollectionName>(
  collection: N,
  filter: FilterOf<DocOf<N>>,
  values: Partial<DocOf<N>>,
): Promise<WriteResult> {
  const changes = setClause(values);
  if ("updatedAt" in (specFor(collection).defaults ?? {})) changes.updatedAt = new Date();
  try {
    const result = await raw(collection).updateOne(toStoredFilter(filter), { $set: changes }, {
      upsert: false,
      ...sessionOption(),
    });
    return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount };
  } catch (error) {
    throw translateError(collection, error);
  }
}

/** Atomic counter, for the abuse limits that must never read-then-write. */
export async function incrementDoc<N extends CollectionName>(
  collection: N,
  filter: FilterOf<DocOf<N>>,
  field: string,
  by = 1,
): Promise<number | null> {
  const result = await raw(collection).findOneAndUpdate(toStoredFilter(filter), { $inc: { [field]: by } }, {
    returnDocument: "after",
    ...sessionOption(),
  });
  const value = (result as Document | null)?.[field];
  return typeof value === "number" ? value : null;
}

/**
 * Deletes, honouring the referential actions the relational schema declared.
 *
 * `cascade` is opt-in: silently removing a pupil's attendance history because a
 * caller deleted the student is a data-loss bug, not a convenience. Where the
 * SQL schema said RESTRICT, a delete is refused while dependents exist.
 */
export async function deleteDocs<N extends CollectionName>(
  collection: N,
  filter: FilterOf<DocOf<N>>,
  options: { cascade?: boolean } = {},
): Promise<number> {
  const targets = await findDocs(collection, filter, { projection: { id: 1 } });
  const ids = targets.map((target) => (target as Document).id as string);
  if (ids.length === 0) return 0;

  // A dependent holds whatever the reference pointed at: usually the id, but a
  // grant stores `permissions.key`. Looking for ids under the wrong field would
  // find no dependents and let a restricted delete through.
  const refValues = new Map<string, string[]>();
  const referencedBy = async (field: string): Promise<string[]> => {
    const cached = refValues.get(field);
    if (cached) return cached;
    const rows = await findDocs(collection, filter, { projection: { [field]: 1 } });
    const values = rows
      .map((row) => (row as Document)[field])
      .filter((value): value is string => typeof value === "string");
    refValues.set(field, values);
    return values;
  };

  for (const other of Object.keys(collectionSpecs) as CollectionName[]) {
    if (other === collection) continue;
    for (const key of collectionSpecs[other].foreignKeys ?? []) {
      if (key.ref !== collection) continue;
      const refField = key.refField ?? "id";
      const values = refField === "id" ? ids : await referencedBy(refField);
      if (values.length === 0) continue;
      const dependents = await raw(other).countDocuments({
        [key.field]: { $in: values },
      } as Filter<Stored>, sessionOption());
      if (dependents === 0) continue;
      if (key.onDelete === "cascade") {
        if (!options.cascade) {
          throw new ConstraintViolation(
            other,
            `${dependents} rows point at ${collection} and would go with it; pass { cascade: true }`,
          );
        }
        await raw(other).deleteMany({ [key.field]: { $in: values } } as Filter<Stored>, sessionOption());
      } else if (key.onDelete === "set null") {
        await raw(other).updateMany(
          { [key.field]: { $in: values } } as Filter<Stored>,
          { $set: { [key.field]: null } },
          sessionOption(),
        );
      } else {
        throw new ConstraintViolation(
          other,
          `${dependents} rows still reference ${collection}`,
        );
      }
    }
  }

  const result = await raw(collection).deleteMany(toStoredFilter(filter), sessionOption());
  return result.deletedCount;
}

/**
 * Commits a group of writes together, the way `db.transaction()` did.
 *
 * Needs a replica set. Atlas clusters are always replica sets and the local
 * development server runs as one, so a standalone `mongod` here is a
 * misconfiguration and is reported as such rather than silently downgraded —
 * a half-applied write is exactly what a transaction exists to prevent.
 */
export async function withTransaction<R>(work: () => Promise<R>): Promise<R> {
  const client = getDb().client;
  const session = client.startSession();
  try {
    let result: R | undefined;
    let ran = false;
    await session.withTransaction(async () => {
      ran = true;
      result = await transactionScope.run(session, work);
    });
    if (!ran) throw new TransactionsUnavailable("the transaction body never started");
    return result as R;
  } catch (error) {
    if (error instanceof MongoServerError && /Transaction numbers|not a replica set|replica set name mismatch/i.test(error.message)) {
      throw new TransactionsUnavailable(error.message);
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

/** Escape hatch for the aggregation pipelines a real join still needs. */
export function collectionRef<N extends CollectionName>(name: N): Collection<Stored> {
  return raw(name);
}
