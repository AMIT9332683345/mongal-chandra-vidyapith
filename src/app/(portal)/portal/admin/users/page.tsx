import { ActionForm } from "@/components/cms-form";
import { Field } from "@/components/field";
import { PanelShell } from "@/components/panel-shell";
import { EmptyState } from "@/components/section-heading";
import { formatDateTime } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import { makeCsrfToken, principalHas } from "@/server/auth/session";
import { requirePanel } from "@/server/auth/gate";
import { listRecoveryRequests, listRolesForAdmin, listUsersForAdmin } from "@/server/content/library";
import {
  assignUserRoleAction,
  createUserAction,
  resetUserPasswordAction,
  resolveRecoveryRequestAction,
  setUserActiveAction,
  updateUserEmailAction,
} from "@/server/content/library-actions";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Accounts and roles",
  description: "Who may sign in to the panel, and what each account is allowed to do.",
  path: "/portal/admin/users",
  noIndex: true,
});

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  suspended: "Suspended",
  deleted: "Deleted",
  invited: "Invited",
};

export default async function UsersPanelPage() {
  const actor = await requirePanel("user.view", "/portal/admin/users");
  const [users, roles, recoveryRequests] = await Promise.all([
    listUsersForAdmin(),
    listRolesForAdmin(),
    listRecoveryRequests(),
  ]);
  const csrfToken = makeCsrfToken(actor.sessionId);
  const canCreate = principalHas(actor, "user.create");
  const canAssign = principalHas(actor, "role.assign");
  const canSuspend = principalHas(actor, "user.deactivate");
  const canEdit = principalHas(actor, "user.edit");
  const canReset = principalHas(actor, "user.password_reset");

  const roleOptions = roles.map((role) => ({ value: role.id, label: role.name }));

  return (
    <PanelShell
      actor={actor}
      active="/portal/admin/users"
      eyebrow="Administration"
      title="Accounts and roles"
      intro="A person is given an account, and the account is given one role. The role decides what the rest of the panel shows them, and every action re-checks that permission on the server."
    >
      {canCreate ? (
        <section className="card p-6">
          <h2 className="text-[1.15rem]">Create an account</h2>
          <p className="mt-1 text-[0.9rem]" style={{ color: "var(--ink-muted)" }}>
            The password is generated here and shown once. The person is asked to change it when they first sign in.
          </p>
          <ActionForm
            action={createUserAction}
            csrfToken={csrfToken}
            submitLabel="Create the account"
            resetOnSuccess
            className="mt-4"
          >
            <div className="grid gap-x-6 sm:grid-cols-2">
              <Field uid="new-user" name="displayName" label="Their name" required autoComplete="off" />
              <Field uid="new-user" name="email" label="Email address" type="email" required autoComplete="off" />
              <Field
                uid="new-user"
                name="roleId"
                label="Role"
                as="select"
                required
                options={[{ value: "", label: "Choose a role" }, ...roleOptions]}
              />
            </div>
          </ActionForm>
        </section>
      ) : (
        <p className="pending">
          This account may see the list but not create an account. Only someone holding “user.create” can.
        </p>
      )}

      <section className="rule mt-10 pt-8">
        <h2 className="text-[1.15rem]">Access requests</h2>
        <p className="mt-1 max-w-prose text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
          What the public <strong>Forgotten username or password</strong> form has received. A request never changes an
          account by itself. When you issue a password here it is shown once, every session for that account ends, and
          the person must choose their own at the next sign-in.
        </p>
        {recoveryRequests.length === 0 ? (
          <p className="pending mt-4">No request is waiting. The form at /forgot writes here.</p>
        ) : (
          <ul className="mt-4 space-y-4" style={{ listStyle: "none" }}>
            {recoveryRequests.map((request) => (
              <li key={request.id} className="card p-5">
                <p className="font-semibold" style={{ color: "var(--ink)" }}>
                  {request.identifier}
                </p>
                <p className="mt-1 text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
                  Asked {formatDateTime(request.createdAt) ?? "recently"} ·{" "}
                  {request.matchedUser ? (
                    <span>
                      matches <strong style={{ color: "var(--ink)" }}>{request.matchedUser.displayName}</strong> (
                      {request.matchedUser.email}, {request.matchedUser.status})
                    </span>
                  ) : (
                    <span>no account matches — check the spelling with the caller before doing anything</span>
                  )}
                </p>

                {canReset ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {request.matchedUser ? (
                      <ActionForm
                        action={resolveRecoveryRequestAction}
                        csrfToken={csrfToken}
                        submitLabel="Issue a new password"
                        variant="gold"
                        small
                        confirm={`Issue a new password for ${request.matchedUser.displayName}? Their sessions end and the old password stops working.`}
                        hidden={{ requestId: request.id, intent: "reset" }}
                      />
                    ) : null}
                    <ActionForm
                      action={resolveRecoveryRequestAction}
                      csrfToken={csrfToken}
                      submitLabel="Dismiss"
                      variant="secondary"
                      small
                      inline
                      hidden={{ requestId: request.id, intent: "dismiss" }}
                    />
                  </div>
                ) : (
                  <p className="mt-3 text-[0.88rem]" style={{ color: "var(--ink-muted)" }}>
                    Answering a request needs “user.password_reset”.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rule mt-10 pt-8">
        <h2 className="text-[1.15rem]">Every account</h2>
        {users.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No accounts" note="That should not be possible — at least the account you are signed in with exists." />
          </div>
        ) : (
          <ul className="mt-4 space-y-4">
            {users.map((user) => {
              const isSelf = user.id === actor.userId;
              return (
                <li key={user.id} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold" style={{ color: "var(--ink)" }}>
                        {user.displayName}
                        {isSelf && (
                          <span className="ml-2 text-[0.78rem] font-normal" style={{ color: "var(--ink-muted)" }}>
                            (you)
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
                        {user.email}
                      </p>
                      <p className="mt-2 flex flex-wrap gap-2 text-[0.78rem]">
                        <span
                          className="tag"
                          style={
                            user.status === "active"
                              ? { borderColor: "var(--accent)", color: "var(--accent)" }
                              : { borderColor: "var(--alert)", color: "var(--alert)" }
                          }
                        >
                          {STATUS_LABEL[user.status] ?? user.status}
                        </span>
                        {user.roles.length === 0 ? (
                          <span className="tag">no role</span>
                        ) : (
                          user.roles.map((role) => (
                            <span key={role} className="tag">
                              {role}
                            </span>
                          ))
                        )}
                        {user.mustChangePassword && <span className="tag">password not yet changed</span>}
                      </p>
                      <p className="mt-2 text-[0.82rem]" style={{ color: "var(--ink-muted)" }}>
                        Last signed in {formatDateTime(user.lastLoginAt) ?? "never"} · created{" "}
                        {formatDateTime(user.createdAt) ?? "—"}
                      </p>
                    </div>

                    {canSuspend && !isSelf ? (
                      <ActionForm
                        action={setUserActiveAction}
                        csrfToken={csrfToken}
                        submitLabel={user.status === "active" ? "Suspend" : "Reactivate"}
                        variant={user.status === "active" ? "danger" : "secondary"}
                        small
                        inline
                        confirm={
                          user.status === "active"
                            ? `Suspend ${user.displayName}? Their sessions are ended immediately.`
                            : undefined
                        }
                        hidden={{ userId: user.id, intent: user.status === "active" ? "suspend" : "activate" }}
                      />
                    ) : null}
                  </div>

                  {canAssign ? (
                    <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--line)" }}>
                      <ActionForm
                        action={assignUserRoleAction}
                        csrfToken={csrfToken}
                        submitLabel="Change the role"
                        hidden={{ userId: user.id }}
                        className="flex flex-wrap items-end gap-4"
                        note="One role at a time; replacing it ends the old one."
                      >
                        <div className="min-w-[16rem] flex-1">
                          <Field
                            uid={`user-${user.id}`}
                            name="roleId"
                            label="Role"
                            as="select"
                            required
                            defaultValue={user.roleIds[0] ?? ""}
                            options={[{ value: "", label: "Choose a role" }, ...roleOptions]}
                          />
                        </div>
                      </ActionForm>
                    </div>
                  ) : null}

                  {canEdit || canReset ? (
                    <div
                      className="mt-4 flex flex-wrap items-start gap-6 border-t pt-4"
                      style={{ borderColor: "var(--line)" }}
                    >
                      {canEdit ? (
                        <ActionForm
                          action={updateUserEmailAction}
                          csrfToken={csrfToken}
                          submitLabel="Change the address"
                          variant="secondary"
                          small
                          hidden={{ userId: user.id }}
                          note="The account is signed out everywhere and must sign in with the new address."
                          className="min-w-[17rem] flex-1"
                        >
                          <Field
                            uid={`email-${user.id}`}
                            name="email"
                            label="Sign-in address"
                            type="email"
                            required
                            defaultValue={user.email}
                          />
                        </ActionForm>
                      ) : null}

                      {canReset ? (
                        <ActionForm
                          action={resetUserPasswordAction}
                          csrfToken={csrfToken}
                          submitLabel="Issue a one-time password"
                          variant="secondary"
                          small
                          confirm={`Issue a new password for ${user.displayName}? Every session ends and the current password stops working.`}
                          hidden={{ userId: user.id }}
                          note="Shown once here. The person must choose a new password at the next sign-in."
                          className="min-w-[15rem]"
                        />
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rule mt-10 pt-8">
        <h2 className="text-[1.15rem]">The roles available</h2>
        <div className="mt-4 overflow-x-auto">
          <table>
            <caption className="sr-only">Each role and the access it grants</caption>
            <thead>
              <tr>
                <th scope="col">Role</th>
                <th scope="col">What it is for</th>
                <th scope="col">Lands on</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id}>
                  <th scope="row" className="text-left">
                    {role.name}
                  </th>
                  <td>{role.description ?? "—"}</td>
                  <td>
                    <code>{role.dashboardPath}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="pending mt-6">
          A role is not a promise about what a page shows — it is a statement about what the server will accept. If a
          link is missing from a person's panel, the reason is the role; if a write is refused, the same role explains
          it, and both are recorded in the audit trail.
        </p>
      </section>
    </PanelShell>
  );
}
