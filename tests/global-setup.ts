import { MongoClient } from "mongodb";

/**
 * Prepares an isolated test database before any suite runs.
 *
 * Tests exercise real queries against the same MongoDB server the application
 * uses, in a separate database (`mcv_test`), because two of the rules being
 * tested — that records survive a restart, and that a permission is enforced by
 * the backend rather than the interface — cannot be observed in a mock.
 *
 * The database is emptied and its schema rebuilt every run, so a suite can never
 * inherit documents from the previous one.
 */

const TEST_DATABASE = process.env.TEST_DATABASE_NAME ?? "mcv_test";

/** The name every worker must point its client at, set again in `setup-env.ts`. */
export function testDatabaseName(): string {
  return TEST_DATABASE;
}

function serverUri(): string {
  return process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
}

export default async function globalSetup(): Promise<void> {
  // Dropping collections is the whole point here, so the target is checked
  // before anything is removed: a mistyped name must not reach a real database.
  if (!/test/i.test(TEST_DATABASE)) {
    throw new Error(`Refusing to reset "${TEST_DATABASE}": TEST_DATABASE_NAME must contain "test".`);
  }

  process.env.MONGODB_DATABASE = TEST_DATABASE;

  const client = new MongoClient(serverUri(), { serverSelectionTimeoutMS: 20_000 });
  await client.connect();
  try {
    const db = client.db(TEST_DATABASE);
    const names = (await db.listCollections().toArray()).map((entry) => entry.name);
    for (const name of names) await db.collection(name).drop();
  } finally {
    await client.close();
  }

  // Imported after the name is set: both the environment module and the cached
  // client read it once, at first import.
  const { closeMongo } = await import("@/server/db/mongo/client");
  const { ensureSchema } = await import("@/server/db/mongo/ensure-schema");
  const { seedReferenceData } = await import("@/server/db/reference-data");
  const { PERMISSION_CATALOGUE, ROLE_DEFINITIONS, expandGrants } = await import(
    "@/server/auth/permissions"
  );

  await ensureSchema();

  const catalogueKeys = new Set(PERMISSION_CATALOGUE.map((permission) => permission.key));
  await seedReferenceData({
    permissions: PERMISSION_CATALOGUE,
    roles: ROLE_DEFINITIONS,
    expand: (patterns: string[]) => expandGrants(patterns, catalogueKeys),
    pruneGrants: true,
  });

  // The next import of the client module in a worker builds its own connection,
  // so closing this one leaves no idle pool behind.
  await closeMongo();
}
