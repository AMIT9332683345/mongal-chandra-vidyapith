#!/usr/bin/env node
/**
 * Brings the database to the shape the application expects.
 *
 *   npm run db:migrate
 *
 * MongoDB has no ordered migration history, so this is a convergence step
 * rather than a replay: `ensureSchema()` declares the validators and indexes the
 * collections should carry and every run makes the live database match, which
 * leaves a brand-new cluster and one aged by months identical.
 */
import "./load-env";
import { env } from "@/server/config/env";
import { closeMongo } from "../src/server/db/mongo/client";
import { ensureSchema } from "../src/server/db/mongo/ensure-schema";

async function main() {
  process.stdout.write("Applying the schema (collections, validators, indexes) ...\n");
  const report = await ensureSchema();
  process.stdout.write("Schema applied.\n");

  console.log(`  collections created   ${report.created.length}`);
  console.log(`  collections updated   ${report.existing.length}`);
  console.log(`  indexes created       ${report.indexesCreated}`);
  if (report.indexesRebuilt.length > 0) {
    console.log(`  indexes rebuilt       ${report.indexesRebuilt.join(", ")}`);
  }
  console.log(`[db] ${report.created.length + report.existing.length} collections in ${env.MONGODB_DATABASE}.`);
  console.log("[db] Next: npm run db:seed to write roles, permissions and the content vocabulary.");
}

main()
  .then(closeMongo)
  .catch(async (error) => {
    console.error("Schema update failed:", error);
    await closeMongo();
    process.exit(1);
  });
