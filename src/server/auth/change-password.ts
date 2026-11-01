import { findDoc, updateOneDoc } from "@/server/db/mongo/repository";
import { checkPasswordStrength, hashPassword, verifyPassword } from "./passwords";

/**
 * Changing your own password.
 *
 * The current password is always required, including for an account holding a
 * password the setup script issued: `mustChangePassword` is a prompt, not a
 * bypass. A wrong current password and an unknown account answer identically,
 * and nothing about the stored hash is ever returned.
 */

export type PasswordChangeFailure = {
  ok: false;
  code: "wrong_password" | "too_weak" | "unchanged";
  message: string;
  fields?: Record<string, string[]>;
};

export type PasswordChangeOutcome = { ok: true } | PasswordChangeFailure;

/** Field errors are keyed by the input the visitor has to correct. */
function field(name: string, messages: string[]): Record<string, string[]> {
  return { [name]: messages };
}

export async function changeOwnPassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<PasswordChangeOutcome> {
  const account = await findDoc(
    "users",
    { id: input.userId },
    { projection: { passwordHash: 1, status: 1, passwordChangedAt: 1 } },
  );

  if (!account || account.status !== "active") {
    // Same answer as a wrong password: the form is not an account oracle.
    return { ok: false, code: "wrong_password", message: "That password is not correct." };
  }

  const currentIsRight = await verifyPassword(input.currentPassword, account.passwordHash);
  if (!currentIsRight) {
    return { ok: false, code: "wrong_password", message: "That password is not correct." };
  }

  if (input.newPassword === input.currentPassword) {
    return {
      ok: false,
      code: "unchanged",
      message: "Choose a password this account is not already using.",
      fields: field("newPassword", ["Use a password different from the one you entered above."]),
    };
  }

  const strength = checkPasswordStrength(input.newPassword);
  if (!strength.ok) {
    return {
      ok: false,
      code: "too_weak",
      message: "That password is not strong enough yet.",
      fields: field("newPassword", strength.problems),
    };
  }

  await updateOneDoc(
    "users",
    { id: input.userId },
    {
      passwordHash: await hashPassword(input.newPassword),
      // The account has now proved it knows a secret, so the flag clears.
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    },
  );

  return { ok: true };
}
