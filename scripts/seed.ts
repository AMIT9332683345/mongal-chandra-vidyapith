#!/usr/bin/env node
/**
 * Seeds the configuration a fresh database needs.
 *
 *   npm run db:seed
 *   npm run db:seed -- --prune-grants
 *
 * The data itself lives in `src/server/db/reference-data.ts`, which the test
 * suite seeds into a throwaway database with the same code path.
 *
 * This script writes no fact about the school that the school has not supplied,
 * and no user account: the first administrator comes from `npm run setup:admin`,
 * so there is no default password anywhere in the system.
 */
import "./load-env";
import { closeMongo, getDb } from "../src/server/db/mongo/client";
import { seedReferenceData } from "../src/server/db/reference-data";
import { PERMISSION_CATALOGUE, ROLE_DEFINITIONS, expandGrants } from "../src/server/auth/permissions";

async function main() {
  const pruneGrants = process.argv.includes("--prune-grants");
  const catalogueKeys = new Set(PERMISSION_CATALOGUE.map((permission) => permission.key));

  const counts = await seedReferenceData({
    permissions: PERMISSION_CATALOGUE,
    roles: ROLE_DEFINITIONS,
    expand: (patterns: string[]) => expandGrants(patterns, catalogueKeys),
    pruneGrants,
  });

  const collections = await getDb().listCollections().toArray();

  console.log(`[seed] configuration written${pruneGrants ? " (grants pruned to definitions)" : ""}`);
  for (const [name, value] of Object.entries(counts)) {
    console.log(`  ${name.padEnd(20)} ${value}`);
  }
  console.log(`  collections         ${collections.length}`);
  console.log(
    "[seed] School facts stay absent on purpose: unconfirmed settings and facilities " +
      "render as gaps until the school supplies them.",
  );
  console.log("[seed] Next: npm run setup:admin to create the first administrator.");
}

void main()
  .then(closeMongo)
  .catch(async (error) => {
    console.error("[seed] failed", error);
    await closeMongo();
    process.exitCode = 1;
  });
