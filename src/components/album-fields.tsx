import { Field, FieldGroup } from "@/components/field";

export type AlbumFieldValues = {
  title?: string;
  description?: string | null;
  categoryKey?: string | null;
};

/**
 * The album's own words.
 *
 * The description is what a visitor reads before deciding whether the pictures
 * inside are the school day they are looking for, so it is a caption rather than a
 * filing note — and it is editable separately from the photographs, because an
 * album often needs its sentence fixed after the frames were filed.
 */
export function AlbumFields({
  uid,
  album,
  categories,
}: {
  uid: string;
  album?: AlbumFieldValues;
  categories: { key: string; name: string }[];
}) {
  return (
    <FieldGroup title="The album">
      <Field
        uid={uid}
        name="title"
        label="Title"
        required
        defaultValue={album?.title ?? ""}
        hint="Becomes the web address, so keep it plain."
      />
      <Field
        uid={uid}
        name="categoryKey"
        label="Category"
        as="select"
        defaultValue={album?.categoryKey ?? ""}
        options={[
          { value: "", label: "No category" },
          ...categories.map((category) => ({ value: category.key, label: category.name })),
        ]}
      />
      <div className="sm:col-span-2">
        <Field
          uid={uid}
          name="description"
          label="Description"
          as="textarea"
          rows={4}
          defaultValue={album?.description ?? ""}
          hint="What the photographs show, in the school's own words. Nothing here should describe a picture that is not in the album."
        />
      </div>
    </FieldGroup>
  );
}
