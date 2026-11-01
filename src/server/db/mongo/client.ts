import { MongoClient, type Db } from "mongodb";
import { env } from "@/server/config/env";

/**
 * One client per process.
 *
 * Next.js reloads modules on every edit in development, so the client is cached
 * on globalThis; without that, `npm run dev` leaks a connection pool per request.
 * The driver's pool is sized down because an Atlas free cluster caps connections.
 */
declare global {
  // eslint-disable-next-line no-var
  var __mcvidyapithMongo: MongoClient | undefined;
}

export function getMongoClient(): MongoClient {
  if (!globalThis.__mcvidyapithMongo) {
    const client = new MongoClient(env.MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 0,
      // Atlas puts an idle connection to sleep; a stale socket must not hang a
      // page render for the driver's default ten seconds.
      serverSelectionTimeoutMS: 8_000,
      connectTimeoutMS: 10_000,
      retryWrites: true,
      appName: "mongal-chandra-vidyapith",
    });
    globalThis.__mcvidyapithMongo = client;
  }
  return globalThis.__mcvidyapithMongo;
}

export function getDb(): Db {
  return getMongoClient().db(env.MONGODB_DATABASE);
}

export async function closeMongo(): Promise<void> {
  if (globalThis.__mcvidyapithMongo) {
    await globalThis.__mcvidyapithMongo.close();
    globalThis.__mcvidyapithMongo = undefined;
  }
}
