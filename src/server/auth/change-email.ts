import { CASE_INSENSITIVE, findDoc, updateOneDoc } from "@/server/db/mongo/repository";
import { UniqueViolation } from "@/server/db/mongo/errors";
import { verifyPassword } from "./passwords";

/**
 * Changing your own sign-in address.
 *
 * The address is half of the credential, so it is guarded like a password: the
 * current password must be presented, the new address must be one nobody else
 * holds, and the caller is told nothing that would turn this form into an
 * account-existence oracle. The caller (the route) ends every session and issues
 * a fresh one, so a browser signed in with the old identity cannot keep using it.
 */

export type EmailChangeFailure = {
  ok: false;
  code: "wrong_password" | "invalid_email" | "in_use" | "unchanged";
  message: string;
  fields?: Record<string, string[]>;
};

export type EmailChangeOutcome = { ok: true; email: string } | EmailChangeFailure;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function field(name: string, messages: string[]): Record<string, string[]> {
  return { [name]: messages };
}

export function normalizeEmailAddress(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function changeOwnEmail(input: {
  userId: string;
  currentPassword: string;
  newEmail: string;
}): Promise<EmailChangeOutcome> {
  const account = await findDoc(
    "users",
    { id: input.userId },
    { projection: { email: 1, passwordHash: 1, status: 1 } },
  );

  if (!account || account.status !== "active") {
    return { ok: false, code: "wrong_password", message: "That password is not correct." };
  }

  if (!(await verifyPassword(input.currentPassword, account.passwordHash))) {
    return { ok: false, code: "wrong_password", message: "That password is not correct." };
  }

  const email = normalizeEmailAddress(input.newEmail);
  if (!EMAIL.test(email) || email.length > 200) {
    return {
      ok: false,
      code: "invalid_email",
      message: "That email address is not valid.",
      fields: field("newEmail", ["Enter a complete address, such as name@example.org."]),
    };
  }

  if (email === account.email.toLowerCase()) {
    return {
      ok: false,
      code: "unchanged",
      message: "This account already signs in with that address.",
      fields: field("newEmail", ["Enter a different address."]),
    };
  }

  const taken = await findDoc(
    "users",
    { email, id: { $ne: account.id } },
    { collation: CASE_INSENSITIVE, projection: { id: 1 } },
  );
  if (taken) {
    return {
      ok: false,
      code: "in_use",
      message: "Another account already signs in with that address.",
      fields: field("newEmail", ["Choose an address no other account uses."]),
    };
  }

  try {
    await updateOneDoc("users", { id: account.id }, { email, updatedAt: new Date() });
  } catch (error) {
    // The unique index is the final word: two requests may pass the check above
    // at the same moment, and only one of them may win.
    if (error instanceof UniqueViolation) {
      return {
        ok: false,
        code: "in_use",
        message: "Another account already signs in with that address.",
        fields: field("newEmail", ["Choose an address no other account uses."]),
      };
    }
    throw error;
  }

  return { ok: true, email };
}
