/**
 * School-authored prose is rendered as text, never as HTML.
 *
 * `content_pages.body` is written in a plain-text/markdown editor; splitting on
 * blank lines and emitting React text nodes means an administrator cannot
 * inject markup into the public site through the CMS, and visitors see exactly
 * what was typed.
 */
export function Prose({ text, className = "" }: { text: string | null | undefined; className?: string }) {
  if (!text?.trim()) return null;
  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return (
    <div className={className}>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="my-0 mb-4 last:mb-0">
          {paragraph}
        </p>
      ))}
    </div>
  );
}
