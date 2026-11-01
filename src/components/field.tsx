/**
 * The form controls the public site uses.
 *
 * A label is always tied to its control by `id`, an optional hint is joined with
 * `aria-describedby`, and every id is namespaced by the form it belongs to —
 * two forms on one page otherwise tie a label to the wrong input.
 */
export function Field({
  uid,
  name,
  label,
  type = "text",
  required,
  hint,
  autoComplete,
  rows,
  as,
  options,
  accept,
  max,
  min,
  step,
  defaultValue,
  defaultChecked,
  multiple,
  disabled,
}: {
  uid: string;
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "date" | "datetime-local" | "time" | "url" | "number" | "file" | "password";
  required?: boolean;
  hint?: string;
  autoComplete?: string;
  rows?: number;
  as?: "textarea" | "select" | "checkbox";
  options?: { value: string; label: string }[];
  accept?: string;
  max?: string;
  min?: string;
  step?: string;
  /** What the control starts with. A content panel edits a stored row, not a blank page. */
  defaultValue?: string | number | null;
  defaultChecked?: boolean;
  multiple?: boolean;
  disabled?: boolean;
}) {
  const id = `${uid}-${name}`;
  const describedBy = hint ? `${id}-hint` : undefined;
  const className = as === "checkbox" ? undefined : "mt-1.5";
  const starting = defaultValue === null || defaultValue === undefined ? "" : String(defaultValue);

  if (as === "checkbox") {
    return (
      <p className="mb-4">
        <span className="flex items-start gap-2.5">
          <input
            id={id}
            name={name}
            type="checkbox"
            value="on"
            required={required}
            defaultChecked={defaultChecked}
            aria-describedby={describedBy}
            className="mt-1 h-auto w-auto"
          />
          <label htmlFor={id} className="font-normal text-[0.95rem]">
            {label}
            {required && <span style={{ color: "var(--alert)" }}> *</span>}
            {hint && (
              <span id={`${id}-hint`} className="mt-0.5 block text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
                {hint}
              </span>
            )}
          </label>
        </span>
      </p>
    );
  }

  return (
    <p className="mb-4">
      <label htmlFor={id} className="block">
        {label}
        {required && <span style={{ color: "var(--alert)" }}> *</span>}
      </label>
      {hint && (
        <span id={`${id}-hint`} className="block text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
          {hint}
        </span>
      )}
      {as === "textarea" ? (
        <textarea
          id={id}
          name={name}
          rows={rows ?? 5}
          required={required}
          defaultValue={starting}
          aria-describedby={describedBy}
          disabled={disabled}
          className={className}
        />
      ) : as === "select" ? (
        <select
          id={id}
          name={name}
          className={className}
          required={required}
          defaultValue={starting}
          aria-describedby={describedBy}
          disabled={disabled}
        >
          {options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          name={name}
          type={type}
          required={required}
          autoComplete={autoComplete}
          defaultValue={starting}
          aria-describedby={describedBy}
          accept={accept}
          max={max}
          min={min}
          step={step}
          multiple={multiple}
          disabled={disabled}
          className={className}
          {...(type === "file" ? { style: { border: "1px solid var(--line)", padding: "0.5rem" } } : {})}
        />
      )}
    </p>
  );
}

export function SubmitRow({ label, note }: { label: string; note?: string }) {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-4">
      <button type="submit" className="button button-primary">
        {label}
      </button>
      <span className="text-[0.84rem]" style={{ color: "var(--ink-muted)" }}>
        {note ?? "Marked * is required."}
      </span>
    </p>
  );
}

/** A heading that groups the fields of a long form for a screen reader. */
export function FieldGroup({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rule mt-10 pt-8 first:border-t-0 first:mt-0 first:pt-0">
      <h2 className="text-[1.15rem]">{title}</h2>
      {note && (
        <p className="mt-1 text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
          {note}
        </p>
      )}
      <div className="mt-4 grid gap-x-6 sm:grid-cols-2">{children}</div>
    </section>
  );
}
