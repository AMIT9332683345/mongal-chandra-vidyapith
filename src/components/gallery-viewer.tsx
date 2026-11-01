"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The album lightbox.
 *
 * It is built on the native `<dialog>` element, which means focus trapping,
 * restoration and the Escape key are the browser's job rather than code that
 * can be subtly wrong. Photographs of children only appear here after an
 * administrator has cleared consent, so the viewer has no notion of a hidden
 * frame; what is in the list is published.
 */
export type GalleryPhoto = {
  id: string;
  src: string;
  alt: string;
  caption: string;
  credit: string | null;
};

export function GalleryViewer({ photos, albumTitle }: { photos: GalleryPhoto[]; albumTitle: string }) {
  const [index, setIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (index === null) {
      if (dialog.open) dialog.close();
      return;
    }
    if (!dialog.open) dialog.showModal();
  }, [index]);

  const step = useCallback(
    (delta: number) => {
      setIndex((current) => {
        if (current === null) return current;
        const total = photos.length;
        return (current + delta + total) % total;
      });
    },
    [photos.length],
  );

  // The dialog handles Escape; these two keys are the whole keyboard contract.
  useEffect(() => {
    if (index === null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, step]);

  const active = index === null ? null : photos[index] ?? null;

  return (
    <>
      <ul className="grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((photo, position) => (
          <li key={photo.id}>
            <figure className="m-0">
              <button
                type="button"
                onClick={() => setIndex(position)}
                className="block w-full border p-0 text-left"
                style={{ borderColor: "var(--line)", borderRadius: "var(--radius)", background: "var(--surface)" }}
                aria-label={`Open photograph: ${photo.alt}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="w-full"
                  style={{ display: "block", aspectRatio: "3 / 2", objectFit: "cover", background: "var(--surface-raised)" }}
                />
              </button>
              <figcaption className="mt-2 text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
                {photo.caption}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        onClose={() => setIndex(null)}
        aria-label={`${albumTitle} — photograph viewer`}
        className="m-auto w-[min(64rem,94vw)] border p-0"
        style={{ borderColor: "var(--line)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)" }}
      >
        {active && (
          <div className="p-4">
            <div className="flex items-center justify-between gap-4">
              <p className="eyebrow m-0">
                {(index ?? 0) + 1} of {photos.length}
              </p>
              <button type="button" onClick={() => setIndex(null)} className="button button-secondary">
                Close
              </button>
            </div>

            <div ref={stageRef} className="mt-3 overflow-hidden" style={{ background: "var(--canvas-soft)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={active.id}
                src={active.src}
                alt={active.alt}
                className="mx-auto w-full"
                style={{ maxHeight: "70vh", width: "auto", objectFit: "contain" }}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p style={{ color: "var(--ink)" }}>{active.caption}</p>
                {active.credit && (
                  <p className="mt-1 text-[0.85rem]" style={{ color: "var(--ink-muted)" }}>
                    {active.credit}
                  </p>
                )}
              </div>
              {photos.length > 1 && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => step(-1)} className="button button-secondary">
                    Previous
                  </button>
                  <button type="button" onClick={() => step(1)} className="button button-primary">
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
