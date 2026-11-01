#!/usr/bin/env node
/**
 * Destroys and rebuilds the database, then re-applies the schema.
 * For development and CI only.
 *
 *   npm run db:reset -- --yes
 *
 * Every document in it goes, so the confirmation flag is required and production
 * is refused outright: a mistyped command should not be able to erase a school's
 * records. Files on disk are left alone — this resets the data, not the uploads.
 */
import "./load-env";
import { env } from "../src/server/config/env";
import { closeMongo, getDb } from "../src/server/db/mongo/client";
import { ensureSchema } from "../src/server/db/mongo/ensure-schema";

async function main() {
  if (env.isProduction) {
    throw new Error("db:reset refuses to run with NODE_ENV=production. Restore from a backup instead.");
  }
  if (!process.argv.includes("--yes")) {
    throw new Error(
      "This deletes every document in the database. Re-run with `npm run db:reset -- --yes` to confirm.",
    );
  }

  const db = getDb();
  const names = (await db.listCollections().toArray()).map((entry) => entry.name);

  process.stdout.write(`Dropping ${names.length} collections from "${env.MONGODB_DATABASE}" ...\n`);
  for (const name of names) await db.collection(name).drop();

  process.stdout.write("Re-applying the schema ...\n");
  const report = await ensureSchema();

  process.stdout.write(
    `Database rebuilt with ${report.created.length} collections. Run npm run db:seed next.\n`,
  );
  await closeMongo();
}

main().catch(async (error) => {
  console.error("Reset failed:", error instanceof Error ? error.message : error);
  await closeMongo();
  process.exit(1);
});
