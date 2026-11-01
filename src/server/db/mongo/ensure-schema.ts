import type { CollationOptions, Document } from "mongodb";
import { getDb } from "./client";
import { extraConstraints } from "./constraints";
import { collectionSpecs, type CollectionName } from "./schema.generated";

/**
 * Creates the collections, their validators and their indexes.
 *
 * This replaces `drizzle/` plus `scripts/sql/postgres-constraints.sql`: there is
 * no ordered migration history in MongoDB, so the whole schema is expressed as
 * the state the database should be in and every run converges to it. Everything
 * here is idempotent, so a new cluster and one migrated over months end alike.
 *
 * Validation is `strict`, meaning the rules are checked on updates as well as
 * inserts. Postgres checked every write, and a school record that only obeys the
 * money and date rules on its first save is not a guarantee.
 */

export type SchemaReport = {
  created: string[];
  existing: string[];
  indexesCreated: number;
  indexesRebuilt: string[];
};

function validatorFor(collection: CollectionName): Document {
  const spec = collectionSpecs[collection];
  const checks = extraConstraints[collection]?.checks ?? [];
  const jsonSchema = { $jsonSchema: spec.validator as unknown as Document };
  if (checks.length === 0) return jsonSchema;
  // Cross-field rules are `$expr`, which JSON Schema cannot express, so the two
  // kinds of rule are ANDed — the same shape Postgres reached by putting a CHECK
  // and a NOT NULL on one column.
  return { $and: [jsonSchema, { $expr: { $and: checks } }] };
}

function desiredIndexes(collection: CollectionName): Document[] {
  const spec = collectionSpecs[collection];
  const declared = (spec.indexes ?? []) as unknown as Document[];
  const extra = extraConstraints[collection]?.indexes ?? [];
  return [...declared, ...extra];
}

function sameIndex(a: Document, b: Document): boolean {
  return (
    JSON.stringify(a.key ?? {}) === JSON.stringify(b.key ?? {}) &&
    Boolean(a.unique) === Boolean(b.unique) &&
    JSON.stringify(a.partialFilterExpression ?? null) === JSON.stringify(b.partialFilterExpression ?? null) &&
    JSON.stringify((a.collation as Document | undefined)?.strength ?? null) ===
      JSON.stringify((b.collation as Document | undefined)?.strength ?? null)
  );
}

export async function ensureSchema(): Promise<SchemaReport> {
  const db = getDb();
  const report: SchemaReport = { created: [], existing: [], indexesCreated: 0, indexesRebuilt: [] };
  const present = new Set((await db.listCollections().toArray()).map((entry) => entry.name));

  for (const name of Object.keys(collectionSpecs) as CollectionName[]) {
    if (present.has(name)) {
      await db.command({ collMod: name, validator: validatorFor(name), validationLevel: "strict", validationAction: "error" });
      report.existing.push(name);
    } else {
      await db.createCollection(name, {
        validator: validatorFor(name),
        validationLevel: "strict",
        validationAction: "error",
      });
      report.created.push(name);
    }

    const existing = await db.collection(name).listIndexes().toArray();
    const byName = new Map(existing.map((entry) => [entry.name as string, entry as unknown as Document]));
    const byKey = new Map(existing.map((entry) => [JSON.stringify(entry.key ?? {}), entry.name as string]));

    for (const index of desiredIndexes(name)) {
      const current = byName.get(index.name as string);
      if (current && sameIndex(current, index)) continue;
      if (current) {
        await db.collection(name).dropIndex(index.name as string);
        report.indexesRebuilt.push(`${name}.${index.name}`);
      }
      // Same key under another name is the same rule, renamed. MongoDB refuses
      // two indexes over one key pattern, so the old name goes first.
      const conflict = byKey.get(JSON.stringify(index.key ?? {}));
      if (conflict && conflict !== index.name) {
        await db.collection(name).dropIndex(conflict);
        report.indexesRebuilt.push(`${name}.${conflict} (superseded)`);
        byKey.delete(JSON.stringify(index.key ?? {}));
      }
      await db.collection(name).createIndex(index.key as Document, {
        name: index.name as string,
        unique: Boolean(index.unique),
        ...(index.collation ? { collation: index.collation as unknown as CollationOptions } : {}),
        ...(index.partialFilterExpression
          ? { partialFilterExpression: index.partialFilterExpression as Document }
          : {}),
      });
      byKey.set(JSON.stringify(index.key ?? {}), index.name as string);
      report.indexesCreated += 1;
    }

    // Indexes left over from an older schema definition. The `_id_` index is the
    // server's own and is never a leftover.
    const wanted = new Set(desiredIndexes(name).map((index) => index.name as string));
    for (const entry of existing) {
      const indexName = entry.name as string;
      if (indexName === "_id_" || wanted.has(indexName)) continue;
      await db.collection(name).dropIndex(indexName);
      report.indexesRebuilt.push(`${name}.${indexName} (dropped)`);
    }
  }

  return report;
}

/** Every collection the schema knows about, for the reset script and the tests. */
export const declaredCollections = Object.keys(collectionSpecs) as CollectionName[];
