import Image from "next/image";

/**
 * The supplied campus photograph is 228 × 190 — genuinely small. Presented at
 * its native size inside a mount, it stays sharp and recognisable.
 *
 * Stretching it across a hero would upscale a 228-pixel file into a blur, and
 * regenerating the building would break the rule against replacing the real
 * school with an AI image. A higher-resolution original is the only correct
 * route to a full-bleed hero, so the frame below is what ships until one is
 * supplied.
 */
export function CampusPhoto({
  caption = "The school campus, photographed from the front grounds.",
}: {
  caption?: string;
}) {
  return (
    <figure className="m-0">
      <div
        className="inline-block border p-3 pb-2"
        style={{ borderColor: "var(--line)", background: "var(--surface)", boxShadow: "var(--shadow-soft)" }}
      >
        <Image
          src="/images/campus.webp"
          alt="Photograph of the Mongal Chandra Vidyapith campus building and grounds"
          width={228}
          height={190}
          priority
          sizes="228px"
          style={{ display: "block", width: 228, height: 190 }}
        />
        <figcaption className="mt-2 max-w-[228px] text-[0.76rem] leading-snug" style={{ color: "var(--ink-muted)" }}>
          {caption}
        </figcaption>
      </div>
    </figure>
  );
}
