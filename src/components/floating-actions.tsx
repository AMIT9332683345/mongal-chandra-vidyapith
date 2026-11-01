import Link from "next/link";

function digits(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

/**
 * The two ways a family reaches the office without hunting for the contact page.
 * Both disappear when the school has not published a telephone number; a dead
 * button is worse than no button.
 */
export function FloatingActions({ phone }: { phone: string | null }) {
  if (!phone) {
    return (
      <div className="mobile-action-bar">
        <Link href="/admissions/apply" className="button button-primary button-small">
          Apply online
        </Link>
        <Link href="/contact" className="button button-secondary button-small">
          Contact office
        </Link>
      </div>
    );
  }

  const number = digits(phone);
  return (
    <>
      <div className="floating-stack">
        <a
          href={`https://wa.me/${number}`}
          className="floating-button floating-whatsapp"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Message the school office on WhatsApp"
        >
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.04 2.5a9.42 9.42 0 0 0-8.06 14.3L2.5 21.5l4.85-1.44a9.42 9.42 0 1 0 4.69-17.56Zm0 1.7a7.72 7.72 0 0 1 0 15.44 7.7 7.7 0 0 1-3.92-1.07l-.28-.17-2.88.85.86-2.8-.18-.29a7.72 7.72 0 0 1 6.4-11.96Zm-3.1 3.5c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.66 2.66 4.08 3.62 2.01.8 2.42.64 2.86.6.44-.04 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28l-1.62-.8c-.22-.1-.38-.16-.54.06-.16.22-.62.8-.76.96-.14.16-.28.18-.52.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.42-1.34-1.66-.14-.24-.02-.38.1-.5.1-.1.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.46-.4-.4-.54-.4h-.46Z" />
          </svg>
        </a>
        <a
          href={`tel:${phone.replace(/[^+\d]/g, "")}`}
          className="floating-button floating-call"
          aria-label={`Call the school office on ${phone}`}
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
          </svg>
        </a>
      </div>

      <div className="mobile-action-bar">
        <Link href="/admissions/apply" className="button button-primary button-small">
          Apply online
        </Link>
        <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="button button-secondary button-small">
          Call office
        </a>
      </div>
    </>
  );
}
