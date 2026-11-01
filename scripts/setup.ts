#!/usr/bin/env node
/**
 * Creates the first administrator account.
 *
 *   npm run setup:admin -- --email office@example.org --name "Office Administrator"
 *
 * There is deliberately no default password. With no `--password`, a strong one
 * is generated, printed once, and the account is flagged so the platform forces
 * a change at the first sign-in. The generated value is never written to the
 * database in plaintext and never printed again.
 *
 * Idempotent by account: an existing address is reported, not overwritten.
 */
import "./load-env";
import { randomBytes } from "node:crypto";
import { closeMongo } from "../src/server/db/mongo/client";
import { CASE_INSENSITIVE, findDoc, insertDoc, insertIfAbsent } from "../src/server/db/mongo/repository";
import { recordAudit } from "../src/server/auth/audit";
import { hashPassword, checkPasswordStrength } from "../src/server/auth/passwords";

/** 24 characters from a 62-symbol alphabet, drawn from 32 bytes of entropy. */
function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(24);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  // The strength rule wants a digit or symbol; append one from fresh entropy.
  return `${out}${randomBytes(1)[0] % 10}`;
}

function readFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const email = readFlag("email");
  const displayName = readFlag("name");
  const roleKey = readFlag("role") ?? "super_admin";
  const suppliedPassword = readFlag("password");

  if (!email || !displayName) {
    throw new Error(
      'Usage: npm run setup:admin -- --email "you@example.org" --name "Your Name" [--role super_admin] [--password ...]',
    );
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
    throw new Error("That email address is not valid.");
  }

  const role = await findDoc("roles", { key: roleKey }, { projection: { id: 1, key: 1 } });
  if (!role) {
    throw new Error(`Role "${roleKey}" is not in the database. Run npm run db:seed first.`);
  }

  const existing = await findDoc(
    "users",
    { email: normalizedEmail },
    { collation: CASE_INSENSITIVE, projection: { id: 1, status: 1 } },
  );

  if (existing) {
    console.log(`[setup] Account ${normalizedEmail} already exists. Nothing was changed.`);
    console.log("[setup] Use the password reset flow if the password is forgotten.");
    return;
  }

  const generated = !suppliedPassword;
  const password = suppliedPassword ?? generatePassword();
  const strength = checkPasswordStrength(password);
  if (!strength.ok) {
    throw new Error(`Refusing to create the account: ${strength.problems.join(" ")}`);
  }

  const account = await insertDoc("users", {
    email: normalizedEmail,
    displayName: displayName.trim(),
    passwordHash: await hashPassword(password),
    // An account created by this procedure is usable immediately; the
    // generated-password path forces a change on first sign-in.
    status: "active",
    mustChangePassword: generated,
    passwordChangedAt: new Date(),
  });

  // A school-wide grant: no class, no academic year.
  await insertIfAbsent("user_roles", { userId: account.id, roleId: role.id });

  await recordAudit({
    actorUserId: account.id,
    actorRoleKey: role.key,
    action: "auth.administrator_created",
    resourceType: "user",
    resourceId: account.id,
    summary: generated
      ? "First administrator created with a generated password"
      : `Administrator granted the ${roleKey} role`,
    metadata: { roleKey, throughSetupScript: true },
  });

  console.log(`[setup] Created ${roleKey} account ${normalizedEmail}`);
  if (generated) {
    console.log("[setup] One-time password (shown once, change it at first sign-in):");
    console.log(`        ${password}`);
  }
  console.log("[setup] Sign in at /signin. Delete this terminal's scrollback after use.");
}

void main()
  .then(closeMongo)
  .catch(async (error) => {
    console.error(`[setup] ${error instanceof Error ? error.message : error}`);
    await closeMongo();
    process.exitCode = 1;
  });
