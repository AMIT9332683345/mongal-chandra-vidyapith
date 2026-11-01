import { PanelShell } from "@/components/panel-shell";
import { ActionForm } from "@/components/cms-form";
import { Field } from "@/components/field";
import { listSettingsForAdmin, type SettingAdminRow } from "@/server/content/admin";
import { saveSettingsAction } from "@/server/content/actions";
import { makeCsrfToken } from "@/server/auth/session";
import { requirePanel } from "@/server/auth/gate";
import { pageMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "School details",
  description: "Every fact the public pages print, with the school's own answer or a marked gap.",
  path: "/portal/content/settings",
  noIndex: true,
});

/** Friendlier headings for the groups the catalogue ships with; anything else prints its own name. */
const GROUP_LABEL: Record<string, string> = {
  identity: "Who the school is",
  contact: "How to reach the school",
  history: "History",
  leadership: "Leadership and stated purpose",
  academic: "Academic programme",
  statistics: "Numbers the school publishes",
  admissions: "Admissions",
  website: "The website itself",
};

const CONTROL: Record<string, { type?: "text" | "email" | "tel" | "date" | "url" | "number"; as?: "textarea" }> = {
  text: { type: "text" },
  email: { type: "email" },
  tel: { type: "tel" },
  url: { type: "url" },
  number: { type: "number" },
  date: { type: "date" },
  textarea: { as: "textarea" },
  rich_text: { as: "textarea" },
};

/**
 * A setting row is two separate facts: what the office typed, and whether the
 * school stands behind it. A `document` row holds an id rather than prose, so it
 * is shown rather than asked for — the file itself belongs to the documents panel.
 */
function SettingRow({ row }: { row: SettingAdminRow }) {
  const control = CONTROL[row.inputKind];
  const hint = [row.description, row.placeholderNote].filter(Boolean).join(" — ") || undefined;

  if (!control) {
    return (
      <Field
        uid="settings"
        name={`set.${row.key}`}
        label={row.label}
        defaultValue={row.value}
        disabled
        hint={`This row holds a ${row.inputKind} reference, not a sentence. Set it from the panel that manages that object.`}
      />
    );
  }

  return (
    <Field
      uid="settings"
      name={`set.${row.key}`}
      label={row.label}
      type={control.type}
      as={control.as}
      rows={row.inputKind === "rich_text" ? 6 : 4}
      defaultValue={row.value}
      hint={hint}
    />
  );
}

export default async function SettingsPanelPage() {
  const actor = await requirePanel("school_setting.edit", "/portal/content/settings");
  const rows = await listSettingsForAdmin();
  const csrfToken = makeCsrfToken(actor.sessionId);

  const groups: { key: string; label: string; rows: SettingAdminRow[] }[] = [];
  for (const row of rows) {
    const bucket = groups.find((entry) => entry.key === row.group);
    if (bucket) bucket.rows.push(row);
    else groups.push({ key: row.group, label: GROUP_LABEL[row.group] ?? row.group, rows: [row] });
  }

  const blank = rows.filter((row) => row.value.trim() === "");
  const typed = rows.filter((row) => row.value.trim() !== "" && !row.confirmed);
  const published = rows.filter((row) => row.value.trim() !== "" && row.confirmed);

  return (
    <PanelShell
      actor={actor}
      active="/portal/content/settings"
      eyebrow="Content panel"
      title="School details"
      intro="The public pages read only what the school has typed here and signed off. Anything still blank appears on the site as a stated gap, never as a sentence the platform invented."
    >
      <div className="card p-6">
        <h2 className="text-[1.15rem]">Where these stand</h2>
        <ul className="mt-3 grid gap-2 text-[0.94rem] sm:grid-cols-3">
          <li>
            <strong className="block text-[1.4rem]">{published.length}</strong>
            <span style={{ color: "var(--ink-muted)" }}>answered and published</span>
          </li>
          <li>
            <strong className="block text-[1.4rem]" style={typed.length > 0 ? { color: "var(--alert)" } : undefined}>
              {typed.length}
            </strong>
            <span style={{ color: "var(--ink-muted)" }}>typed but not signed off</span>
          </li>
          <li>
            <strong className="block text-[1.4rem]">{blank.length}</strong>
            <span style={{ color: "var(--ink-muted)" }}>still awaiting the school</span>
          </li>
        </ul>
        <p className="mt-4 text-[0.9rem]" style={{ color: "var(--ink-muted)" }}>
          Saving a line and publishing it are one form but two facts: a box with words in it and its tick unticked keeps
          those words out of the site. Untick a published line to withdraw it — the answer stays here for the next time.
        </p>
      </div>

      <ActionForm
        action={saveSettingsAction}
        csrfToken={csrfToken}
        submitLabel="Save these details"
        className="mt-10"
        note="Only the lines that actually change are written; the rest are left exactly as they were."
      >
        {groups.map((group) => (
          <section key={group.key} className="rule mt-10 pt-8 first:mt-0 first:pt-0 first:border-t-0">
            <h2 className="text-[1.2rem]">{group.label}</h2>
            <div className="mt-4 grid gap-x-6 sm:grid-cols-2">
              {group.rows.map((row) => (
                <div key={row.id} className="sm:col-span-2">
                  <SettingRow row={row} />
                  <p className="-mt-2 mb-6">
                    <Field
                      uid="confirm"
                      name={`ok.${row.key}`}
                      label={`The school stands behind “${row.label}” — publish it`}
                      as="checkbox"
                      defaultChecked={row.confirmed}
                      hint={
                        row.publicReadable
                          ? undefined
                          : "No public page reads this key yet, so publishing it changes nothing on the site."
                      }
                    />
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </ActionForm>

      <p className="pending mt-10">
        <strong>Changing the official name changes the site’s address bar, navigation, footer and sitemap at once.</strong>{" "}
        It is the one line this platform was given rather than left blank, and it is the one line to be careful with.
      </p>
    </PanelShell>
  );
}
