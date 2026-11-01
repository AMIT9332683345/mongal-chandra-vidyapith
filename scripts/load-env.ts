import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * Loads `.env`, `.env.local`, `.env.<NODE_ENV>` and friends for the standalone
 * scripts, using the same rules Next uses, so `npm run db:migrate` and
 * `npm run dev` read identical configuration.
 *
 * Import this first in a script: ES module imports evaluate in source order,
 * so the environment is populated before the database client opens a pool.
 */
loadEnvConfig(path.resolve(process.cwd()), process.env.NODE_ENV === "production");
