import { testDatabaseName } from "./global-setup";

/**
 * Runs in every test worker before a suite imports the application.
 *
 * Pointing `MONGODB_DATABASE` here rather than relying on `globalSetup` to have
 * done it is deliberate: workers are separate contexts, and a test that quietly
 * connected to the development database would read rows it did not create.
 */
process.env.MONGODB_DATABASE = testDatabaseName();

export {};
