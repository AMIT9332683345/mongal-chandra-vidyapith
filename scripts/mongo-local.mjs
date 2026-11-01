#!/usr/bin/env node
/**
 * Starts a real MongoDB server for local development.
 *
 * The binary ships inside node_modules (downloaded by `mongodb-memory-server`),
 * so no system installation, Docker account or administrator rights are needed.
 * It is a genuine mongod listening on TCP with its data in ./.mongo-data, so the
 * same driver, validators and indexes run against it as against Atlas.
 *
 * It runs as a single-node replica set, not a standalone server, because
 * multi-document transactions only exist on replica sets — and every Atlas
 * cluster is one. Local development therefore exercises the same commit
 * behaviour production will, instead of a mode that silently lacks it.
 *
 *   node scripts/mongo-local.mjs start   (foreground; Ctrl-C to stop)
 *   node scripts/mongo-local.mjs stop    (best-effort stop of a tracked instance)
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoBinary } from "mongodb-memory-server";
import { MongoClient } from "mongodb";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");

const LOCAL = {
  port: Number(process.env.LOCAL_DB_PORT ?? 27017),
  database: process.env.MONGODB_DATABASE ?? "mongal_chandra_vidyapith",
  dbPath: path.join(projectRoot, ".mongo-data"),
  replicaSet: "rs0",
};

const pidFile = path.join(LOCAL.dbPath, "local-mongo.pid");

function quiet(chunk) {
  for (const line of String(chunk).split("\n")) {
    const text = line.trim();
    if (!text) continue;
    if (/"attr":\{|"msg":"(Waiting for|Waiting for connections|Index Build|Duration)"|"tags":\{|"command":/.test(text)) continue;
    const message = /"msg":"([^"]+)"/.exec(text)?.[1];
    process.stdout.write(`  ${message ?? text}\n`);
  }
}

function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    const done = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(700);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
  });
}

async function waitForPort(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portIsOpen(LOCAL.port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

/**
 * A fresh data directory comes up knowing no replica set. Initiate it once, then
 * wait for the member to become primary so the first write does not race setup.
 */
async function ensureReplicaSet() {
  const client = new MongoClient(`mongodb://127.0.0.1:${LOCAL.port}/?directConnection=true`);
  await client.connect();
  try {
    const admin = client.db("admin");
    const hello = await admin.command({ hello: 1 });
    if (!hello.setName) {
      await admin.command({
        replSetInitiate: { _id: LOCAL.replicaSet, members: [{ _id: 0, host: `127.0.0.1:${LOCAL.port}` }] },
      });
      process.stdout.write(`  initiated replica set "${LOCAL.replicaSet}"\n`);
    }
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const state = await admin.command({ hello: 1 });
      if (state.isWritablePrimary) return;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    throw new Error("the replica set did not elect a primary within 30 seconds");
  } finally {
    await client.close();
  }
}

async function start() {
  if (await portIsOpen(LOCAL.port)) {
    process.stdout.write(
      `MongoDB is already listening on 127.0.0.1:${LOCAL.port}\n` +
        `MONGODB_URI=mongodb://127.0.0.1:${LOCAL.port}/?replicaSet=${LOCAL.replicaSet}&directConnection=false\n`,
    );
    return;
  }

  fs.mkdirSync(LOCAL.dbPath, { recursive: true });
  const binary = await MongoBinary.getPath();
  process.stdout.write(`Starting local MongoDB on port ${LOCAL.port} ...\n`);

  const child = spawn(
    binary,
    [
      "--dbpath", LOCAL.dbPath,
      "--port", String(LOCAL.port),
      "--bind_ip", "127.0.0.1",
      "--replSet", LOCAL.replicaSet,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  child.stdout.on("data", quiet);
  child.stderr.on("data", quiet);
  child.on("exit", (code) => {
    fs.rmSync(pidFile, { force: true });
    process.stdout.write(`mongod exited with code ${code}\n`);
    process.exit(code ?? 0);
  });

  fs.writeFileSync(pidFile, String(child.pid));

  if (!(await waitForPort(30_000))) {
    process.stderr.write("mongod did not open its port within 30 seconds.\n");
    child.kill();
    process.exit(1);
  }

  await ensureReplicaSet();

  process.stdout.write(
    `\nLocal MongoDB is ready (replica set ${LOCAL.replicaSet}, data in .mongo-data).\n` +
      `MONGODB_URI=mongodb://127.0.0.1:${LOCAL.port}/?replicaSet=${LOCAL.replicaSet}&directConnection=false\n` +
      `MONGODB_DATABASE=${LOCAL.database}\n\n` +
      `Leave this terminal open. Press Ctrl-C to shut down cleanly.\n`,
  );

  let closing = false;
  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    process.stdout.write(`\n${signal} received, stopping mongod ...\n`);
    child.kill();
    fs.rmSync(pidFile, { force: true });
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("Ctrl-C"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

async function stop() {
  if (!fs.existsSync(pidFile)) {
    process.stdout.write("No local MongoDB instance is tracked by this project.\n");
    return;
  }
  const pid = Number(fs.readFileSync(pidFile, "utf8"));
  try {
    process.kill(pid);
    process.stdout.write(`Requested shutdown of pid ${pid}.\n`);
  } catch {
    process.stdout.write(`Process ${pid} is no longer running.\n`);
  }
  fs.rmSync(pidFile, { force: true });
}

const command = process.argv[2] ?? "start";
if (command === "stop") await stop();
else if (command === "start") await start();
else {
  process.stderr.write(`Unknown command "${command}". Use: start | stop\n`);
  process.exit(1);
}
