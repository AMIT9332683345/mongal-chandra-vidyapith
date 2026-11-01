import { Field, FieldGroup } from "@/components/field";

export type NoticeFieldValues = {
  title?: string;
  summary?: string | null;
  body?: string;
  categoryKey?: string | null;
  referenceNumber?: string | null;
  issuedOn?: string | null;
  expiresOn?: string | null;
  pinned?: boolean;
  pinUntil?: string | null;
  audience?: "public" | "staff" | "teachers";
};

/**
 * The notice form, shared by the draft page and the editor.
 *
 * A notice's own reference number and the date it was issued are what a school
 * quotes to a parent three months later, so they are first-class fields rather
 * than sentences in the body: the board can sort and filter on them, and the
 * audit trail has a date that is the school's, not the database's.
 */
export function NoticeFields({
  uid,
  notice,
  categories,
}: {
  uid: string;
  notice?: NoticeFieldValues;
  categories: { key: string; name: string }[];
}) {
  return (
    <>
      <FieldGroup title="What it says">
        <Field
          uid={uid}
          name="title"
          label="Title"
          required
          defaultValue={notice?.title ?? ""}
          hint="Written for the board, not for the file: families read this line first."
        />
        <Field
          uid={uid}
          name="categoryKey"
          label="Category"
          as="select"
          defaultValue={notice?.categoryKey ?? ""}
          options={[
            { value: "", label: "No category" },
            ...categories.map((category) => ({ value: category.key, label: category.name })),
          ]}
        />
        <Field
          uid={uid}
          name="summary"
          label="One-line summary"
          as="textarea"
          rows={2}
          defaultValue={notice?.summary ?? ""}
          hint="Shown in the list. Leave it empty and the list shows the opening of the notice instead."
        />
        <Field
          uid={uid}
          name="referenceNumber"
          label="Reference number"
          defaultValue={notice?.referenceNumber ?? ""}
          hint="The office's own file number, if it has one."
        />
      </FieldGroup>

      <FieldGroup title="The notice itself">
        <div className="sm:col-span-2">
          <Field
            uid={uid}
            name="body"
            label="Full text"
            as="textarea"
            rows={14}
            required
            defaultValue={notice?.body ?? ""}
            hint="Line breaks are kept. A blank notice cannot be published."
          />
        </div>
      </FieldGroup>

      <FieldGroup title="Who sees it">
        <div className="sm:col-span-2">
          <Field
            uid={uid}
            name="audience"
            label="Audience"
            as="select"
            defaultValue={notice?.audience ?? "public"}
            options={[
              { value: "public", label: "Everyone — the public notice board" },
              { value: "staff", label: "Signed-in staff only — never on the public site" },
              { value: "teachers", label: "Teachers only — the teacher area" },
            ]}
            hint="A staff or teacher notice is still published when you publish it, but it has no public address. Use “Teachers only” for credentials."
          />
        </div>
      </FieldGroup>

      <FieldGroup title="When it shows">
        <Field
          uid={uid}
          name="issuedOn"
          label="Issued on"
          type="date"
          defaultValue={notice?.issuedOn ?? ""}
          hint="The date on the paper, not today's date."
        />
        <Field
          uid={uid}
          name="expiresOn"
          label="Stop showing on"
          type="date"
          defaultValue={notice?.expiresOn ?? ""}
          hint="Leave empty to keep it on the board until it is taken down."
        />
        <Field
          uid={uid}
          name="pinned"
          label="Pin to the top of the board"
          as="checkbox"
          defaultChecked={notice?.pinned ?? false}
        />
        <Field
          uid={uid}
          name="pinUntil"
          label="Pinned until"
          type="date"
          defaultValue={notice?.pinUntil ?? ""}
          hint="Only read while the notice is pinned."
        />
      </FieldGroup>
    </>
  );
}
