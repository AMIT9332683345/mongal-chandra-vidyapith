import { redirect } from "next/navigation";
import { getCurrentPrincipal, principalHas, type Principal } from "@/server/auth/session";

/**
 * The door in front of every panel page.
 *
 * A page asks for the permission that its own subject matter needs, and the
 * answer comes from the session row rather than from anything the browser sent.
 * A person who is not signed in is walked to the sign-in screen with the page they
 * wanted remembered; a person who is signed in but not entitled is sent back to
 * the portal with a refusal, not a silently empty version of the page — an empty
 * page invites them to try again, which is the opposite of what a refusal means.
 */
export async function requirePanel(permission: string, path: string): Promise<Principal> {
  const actor = await getCurrentPrincipal();
  if (!actor) redirect(`/signin?next=${encodeURIComponent(path)}`);
  if (!principalHas(actor, permission)) {
    redirect(`/portal?refused=${encodeURIComponent(permission)}`);
  }
  return actor;
}
