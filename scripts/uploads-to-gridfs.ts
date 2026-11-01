#!/usr/bin/env node
/**
 * Copies files written to disk by an older build into GridFS.
 *
 *   npm run db:uploads -- ./uploads
 *
 * Vercel cannot keep an uploaded file, so storage moved into the same MongoDB
 * database as the records. A deployment that already accepted applications or
 * gallery photographs on a host with a disk can import those bytes once with
 * this command. It is idempotent: a storage key already in GridFS is skipped.
 */
import "./load-env";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/server/config/env";
import { closeMongo, getDb } from "@/server/db/mongo/client";
import { findDocs } from "@/server/db/mongo/repository";
import { storeFileBytes } from "@/server/storage/files";

const BUCKET = "uploads";

async function main() {
  const source = path.resolve(process.argv[2] ?? "./uploads");
  const documents = await findDocs("documents", {}, { limit: 10_000 });
  const bucket = getDb().collection(`${BUCKET}.files`);

  let imported = 0;
  let present = 0;
  let missing = 0;

  for (const document of documents) {
    if (!/^[a-f0-9]{64}$/.test(document.storageKey)) continue;
    const already = await bucket.findOne({ filename: document.storageKey }, { projection: { _id: 1 } });
    if (already) {
      present += 1;
      continue;
    }
    try {
      const bytes = await readFile(path.join(source, document.storageKey));
      await storeFileBytes(document.storageKey, bytes);
      imported += 1;
    } catch {
      missing += 1;
      console.log(`  missing on disk: ${document.storageKey} (${document.originalFilename})`);
    }
  }

  console.log(`[uploads] imported ${imported}, already in GridFS ${present}, missing on disk ${missing}`);
  console.log(`[uploads] database ${env.MONGODB_DATABASE}, bucket ${BUCKET}`);
}

main()
  .then(closeMongo)
  .catch(async (error) => {
    console.error("Upload import failed:", error);
    await closeMongo();
    process.exit(1);
  });
