import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Password storage.
 *
 * scrypt from Node's own crypto module: memory-hard, no native build step to
 * drift out of sync on a serverless runtime, and no third-party dependency.
 * Parameters are recorded inside the stored string, so raising them later can
 * verify old hashes and re-hash on next successful login.
 *
 * Format: scrypt$<logN>$<r>$<p>$<salt-b64>$<hash-b64>
 */

const KEY_LENGTH = 64;
const DEFAULT_PARAMS = { n: 2 ** 15, r: 8, p: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return derive(password, salt, DEFAULT_PARAMS).then((hash) =>
    [
      "scrypt",
      Math.log2(DEFAULT_PARAMS.n),
      DEFAULT_PARAMS.r,
      DEFAULT_PARAMS.p,
      salt.toString("base64"),
      hash.toString("base64"),
    ].join("$"),
  );
}

/**
 * Constant-time comparison against the stored hash.
 *
 * A malformed or unknown-format hash returns false rather than throwing, so a
 * corrupt row cannot be distinguished from a wrong password by an attacker
 * watching response times.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, logN, r, p, saltB64, hashB64] = parts;
  const n = 2 ** Number(logN);
  if (!Number.isFinite(n) || !Number.isFinite(Number(r)) || !Number.isFinite(Number(p))) return false;

  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(hashB64, "base64");
    actual = await derive(password, Buffer.from(saltB64, "base64"), {
      n,
      r: Number(r),
      p: Number(p),
    });
  } catch {
    return false;
  }
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/** True when a stored hash was made with weaker parameters than we now require. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return true;
  return Number(parts[1]) < Math.log2(DEFAULT_PARAMS.n);
}

function derive(
  password: string,
  salt: Buffer,
  params: { n: number; r: number; p: number },
): Promise<Buffer> {
  // scrypt's built-in memory ceiling is 32 MB, which N=32768 exceeds.
  const maxmem = 128 * params.n * params.r + 1_048_576;
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { ...params, maxmem }, (error, hash) => {
      if (error) reject(error);
      else resolve(hash);
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Strength policy                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Minimum acceptance rule for a new password.
 *
 * Length matters more than character classes, so the floor is 12 characters
 * with a mix, and the blocklist catches the passwords that appear in every
 * breach of a school management system.
 */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "qwerty123456",
  "school123",
  "student123",
  "admin123456",
  "letmeinletmein",
  "welcome123",
  "mongal123456",
  "123456789012",
  "abcabcabcabc",
]);

export function checkPasswordStrength(password: string): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (password.length < 12) problems.push("Use at least 12 characters.");
  if (!/[a-zA-Z]/.test(password)) problems.push("Include at least one letter.");
  if (!/[0-9]/.test(password) && !/[^a-zA-Z0-9]/.test(password)) {
    problems.push("Include a number or a symbol.");
  }
  if (new Set(password).size < 6) problems.push("Use more different characters.");
  if (COMMON_PASSWORDS.has(password.toLowerCase())) problems.push("That password is too common.");
  return { ok: problems.length === 0, problems };
}
