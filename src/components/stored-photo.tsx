/**
 * A photograph stored in the document library.
 *
 * It is served through `/api/images/[id]`, which refuses anything that is not
 * published and publicly visible, so a component cannot be tricked into
 * rendering a restricted file. Width and height come from the row when the
 * uploader recorded them; without them the box keeps a stable 3:2 ratio so the
 * page does not jump while the picture arrives.
 */
export function StoredPhoto({
  documentId,
  alt,
  widthPx,
  heightPx,
  className,
  eager,
}: {
  documentId: string;
  alt: string;
  widthPx?: number | null;
  heightPx?: number | null;
  className?: string;
  eager?: boolean;
}) {
  const hasIntrinsicSize = typeof widthPx === "number" && typeof heightPx === "number" && widthPx > 0 && heightPx > 0;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/images/${documentId}`}
      alt={alt}
      width={hasIntrinsicSize ? widthPx : undefined}
      height={hasIntrinsicSize ? heightPx : undefined}
      loading={eager ? "eager" : "lazy"}
      // A database-served file has no optimiser signature, so the browser must
      // not be asked to rescale it a second time.
      sizes={hasIntrinsicSize ? undefined : "100vw"}
      decoding="async"
      className={className}
      style={{
        display: "block",
        width: "100%",
        height: "auto",
        aspectRatio: hasIntrinsicSize ? `${widthPx} / ${heightPx}` : "3 / 2",
        objectFit: "cover",
        background: "var(--surface-raised)",
      }}
    />
  );
}
