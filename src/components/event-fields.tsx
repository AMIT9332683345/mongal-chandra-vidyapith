import { Field, FieldGroup } from "@/components/field";

export type EventFieldValues = {
  title?: string;
  summary?: string;
  description?: string;
  categoryKey?: string;
  startsAt?: string;
  endsAt?: string;
  allDay?: boolean;
  venue?: string;
  featured?: boolean;
};

/**
 * The event form.
 *
 * Times are held as instants and edited as local wall-clock text: a school
 * announcement is “the hall, 9 o'clock”, and the only way to keep that meaning
 * when the site is read from another timezone is to write the instant down at the
 * moment of typing rather than converting it back on every view.
 */
export function EventFields({
  uid,
  event,
  categories,
}: {
  uid: string;
  event?: EventFieldValues;
  categories: { key: string; name: string }[];
}) {
  return (
    <>
      <FieldGroup title="What and when">
        <Field
          uid={uid}
          name="title"
          label="Title"
          required
          defaultValue={event?.title ?? ""}
          hint="As it will read on the calendar."
        />
        <Field
          uid={uid}
          name="categoryKey"
          label="Category"
          as="select"
          defaultValue={event?.categoryKey ?? ""}
          options={[
            { value: "", label: "No category" },
            ...categories.map((category) => ({ value: category.key, label: category.name })),
          ]}
          hint="The category groups the day's events, and the homepage sports band reads from it."
        />
        <Field
          uid={uid}
          name="startsAt"
          label="Starts"
          type="datetime-local"
          required
          defaultValue={event?.startsAt ?? ""}
        />
        <Field
          uid={uid}
          name="endsAt"
          label="Ends"
          type="datetime-local"
          defaultValue={event?.endsAt ?? ""}
          hint="Leave empty for an event that is a start time and no more."
        />
        <Field uid={uid} name="venue" label="Where" defaultValue={event?.venue ?? ""} />
        <Field uid={uid} name="allDay" label="All-day event" as="checkbox" defaultChecked={event?.allDay ?? false} />
      </FieldGroup>

      <FieldGroup title="What families read">
        <Field
          uid={uid}
          name="summary"
          label="One-line summary"
          as="textarea"
          rows={2}
          defaultValue={event?.summary ?? ""}
        />
        <div className="sm:col-span-2">
          <Field
            uid={uid}
            name="description"
            label="Full description"
            as="textarea"
            rows={10}
            defaultValue={event?.description ?? ""}
            hint="Timings, who is expected, what to bring."
          />
        </div>
        <Field
          uid={uid}
          name="featured"
          label="Feature it on the homepage"
          as="checkbox"
          defaultChecked={event?.featured ?? false}
        />
      </FieldGroup>
    </>
  );
}
