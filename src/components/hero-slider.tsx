"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export type HeroSlide = {
  documentId: string;
  alt: string;
  title: string;
  caption: string | null;
  albumSlug: string;
};

const INTERVAL_MS = 6000;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * The full-bleed homepage banner, fed by the gallery in the content panel.
 *
 * It auto-advances, stops the moment a visitor touches it — hover, focus or a
 * keyboard interaction — and never animates at all for a visitor who has asked
 * their system to reduce motion. Every frame links to the album it came from, so
 * the banner is a route into the school's own photographs rather than a
 * decoration. With no published photographs the banner keeps its navy ground
 * and says so, instead of borrowing a stock building.
 */
export function HeroSlider({
  slides,
  eyebrow,
  heading,
  intro,
  actions,
}: {
  slides: HeroSlide[];
  eyebrow: string;
  heading: string;
  intro: string | null;
  actions: { href: string; label: string; primary?: boolean }[];
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = usePrefersReducedMotion();

  const count = slides.length;
  const go = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count],
  );

  useEffect(() => {
    if (paused || reduced || count < 2) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % count), INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [paused, reduced, count]);

  return (
    <section
      className="hero"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="The school in photographs"
    >
      {count > 0 && (
        <div className="hero-media">
          {slides.map((slide, position) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={slide.documentId}
              src={`/api/images/${slide.documentId}`}
              alt={position === index ? `${slide.title} — ${slide.alt}` : ""}
              loading={position === 0 ? "eager" : "lazy"}
              decoding="async"
              aria-hidden={position === index ? undefined : true}
              style={{
                position: "absolute",
                inset: 0,
                opacity: position === index ? 1 : 0,
                transition: reduced ? "none" : "opacity 900ms ease",
              }}
            />
          ))}
        </div>
      )}
      <div className="hero-overlay" aria-hidden="true" />

      <div className="shell hero-copy">
        <div className="max-w-3xl">
          <p className="eyebrow" style={{ color: "var(--gold)" }}>
            {eyebrow}
          </p>
          <h1 className="mt-3">{heading}</h1>
          {intro ? (
            <p className="lede mt-5">{intro}</p>
          ) : (
            <p className="lede mt-5">
              A school in Mongal Chandra Vidyapith&rsquo;s own words — the welcome line is written by the
              office in the content panel and published here.
            </p>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={`button ${action.primary ? "button-gold" : "button-outline-light"}`}
              >
                {action.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {count > 0 && (
        <div className="hero-strip">
          <div className="shell flex flex-wrap items-center justify-between gap-4 py-3">
            <p className="min-w-0 truncate text-[0.85rem]" style={{ color: "rgb(255 255 255 / 0.82)" }}>
              <span className="font-semibold text-white">{slides[index].title}</span>
              {slides[index].caption ? ` · ${slides[index].caption}` : ""}
            </p>
            <div className="flex items-center gap-4">
              {count > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => go(index - 1)}
                    className="hero-arrow"
                    aria-label="Previous photograph"
                  >
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => go(index + 1)}
                    className="hero-arrow"
                    aria-label="Next photograph"
                  >
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </button>
                </div>
              )}
              <div className="hero-dots" role="group" aria-label="Choose a photograph">
                {slides.map((slide, position) => (
                  <button
                    key={slide.documentId}
                    type="button"
                    aria-current={position === index ? "true" : undefined}
                    aria-label={`Show ${slide.title}`}
                    onClick={() => go(position)}
                  />
                ))}
              </div>
              <Link
                href={`/gallery/${slides[index].albumSlug}`}
                className="text-[0.82rem] font-semibold no-underline hover:underline"
                style={{ color: "var(--gold)" }}
              >
                View album →
              </Link>
            </div>
          </div>
        </div>
      )}

      {count === 0 && (
        <div className="hero-strip">
          <div className="shell py-3 text-[0.85rem]" style={{ color: "rgb(255 255 255 / 0.82)" }}>
            No photographs are published yet. The banner fills with the school&rsquo;s own albums once
            consent for every pupil in them has been recorded.{" "}
            <Link href="/gallery" className="font-semibold no-underline hover:underline" style={{ color: "var(--gold)" }}>
              Open the gallery →
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
