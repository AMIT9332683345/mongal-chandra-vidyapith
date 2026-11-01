/**
 * FormData is the shape a browser sends; a Zod schema is the shape the server
 * checks. This is the one place that translates between them.
 *
 * An untouched optional field arrives as an empty string, which would fail a
 * length check that should only apply to a value the visitor actually typed, so
 * blanks become absent. Files are kept under their own key: a schema must never
 * receive a `File` object as a string.
 */
export function formValues(formData: FormData): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      if (value.size === 0) continue;
      const files = values[key];
      if (Array.isArray(files)) files.push(value);
      else values[key] = [value];
      continue;
    }
    const text = String(value).trim();
    if (text === "") continue;
    // Repeat the key and the later answer wins, which is what a rebuilt form does.
    values[key] = text;
  }

  return values;
}

/** One string field, or null — for hand-reading a checkbox or a hidden token. */
export function formString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}

/** A checkbox posts "on" when ticked and nothing when it is not. */
export function formChecked(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === "on" || value === "true";
}
