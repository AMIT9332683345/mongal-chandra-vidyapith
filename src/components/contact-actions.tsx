function digits(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

/**
 * The three ways a family reaches the office, kept on screen on every page.
 *
 * A channel the school has not confirmed does not disappear and is not filled in
 * with a plausible number: the button remains, points at the contact page, and
 * says in its accessible name that the detail is not published yet. Nothing here
 * invents a fact about the school — it only decides where a tap goes.
 */
type Channel = {
  key: "call" | "whatsapp" | "email";
  label: string;
  shortLabel: string;
  href: string;
  available: boolean;
  ariaLabel: string;
};

function channels(phone: string | null, email: string | null): Channel[] {
  const tel = phone ? `tel:${phone.replace(/[^+\d]/g, "")}` : null;
  const wa = phone ? `https://wa.me/${digits(phone)}` : null;
  const mail = email ? `mailto:${email}` : null;

  return [
    {
      key: "call",
      label: "Call Now",
      shortLabel: "Call Now",
      href: tel ?? "/contact",
      available: Boolean(tel),
      ariaLabel: tel ? `Call the school office on ${phone}` : "Call Now — the telephone number is not published yet, so this opens the contact form",
    },
    {
      key: "whatsapp",
      label: "WhatsApp Chat Now",
      shortLabel: "WhatsApp",
      href: wa ?? "/contact",
      available: Boolean(wa),
      ariaLabel: wa
        ? `Chat with the school office on WhatsApp at ${phone}`
        : "WhatsApp Chat Now — the number is not published yet, so this opens the contact form",
    },
    {
      key: "email",
      label: "Email Us",
      shortLabel: "Email Us",
      href: mail ?? "/contact",
      available: Boolean(mail),
      ariaLabel: mail ? `Email the school office at ${email}` : "Email Us — the address is not published yet, so this opens the contact form",
    },
  ];
}

function Icon({ channel }: { channel: Channel["key"] }) {
  if (channel === "whatsapp") {
    return (
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.04 2.5a9.42 9.42 0 0 0-8.06 14.3L2.5 21.5l4.85-1.44a9.42 9.42 0 1 0 4.69-17.56Zm0 1.7a7.72 7.72 0 0 1 0 15.44 7.7 7.7 0 0 1-3.92-1.07l-.28-.17-2.88.85.86-2.8-.18-.29a7.72 7.72 0 0 1 6.4-11.96Zm-3.1 3.5c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.66 2.66 4.08 3.62 2.01.8 2.42.64 2.86.6.44-.04 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28l-1.62-.8c-.22-.1-.38-.16-.54.06-.16.22-.62.8-.76.96-.14.16-.28.18-.52.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.42-1.34-1.66-.14-.24-.02-.38.1-.5.1-.1.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.46-.4-.4-.54-.4h-.46Z" />
      </svg>
    );
  }
  if (channel === "email") {
    return (
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m2 7 10 6 10-6" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
    </svg>
  );
}

export function FloatingActions({ phone, email }: { phone: string | null; email: string | null }) {
  const items = channels(phone, email);

  return (
    <>
      <div className="contact-stack" aria-label="Contact the school office">
        {items.map((item) => (
          <a
            key={item.key}
            href={item.href}
            className={`contact-pill contact-${item.key}`}
            data-unpublished={item.available ? undefined : "true"}
            aria-label={item.ariaLabel}
            title={item.ariaLabel}
            {...(item.key === "whatsapp" && item.available
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            <Icon channel={item.key} />
            <span>{item.label}</span>
            {!item.available && <span className="contact-dot" aria-hidden="true" />}
          </a>
        ))}
      </div>

      <div className="mobile-action-bar" aria-label="Contact the school office">
        {items.map((item) => (
          <a
            key={item.key}
            href={item.href}
            className={`contact-bar-button contact-${item.key}`}
            data-unpublished={item.available ? undefined : "true"}
            aria-label={item.ariaLabel}
            {...(item.key === "whatsapp" && item.available
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            <Icon channel={item.key} />
            <span className="contact-bar-label">{item.label}</span>
            <span className="contact-bar-label-short">{item.shortLabel}</span>
          </a>
        ))}
      </div>
    </>
  );
}

/**
 * The same three actions, in the flow of a page rather than fixed over it.
 * `onDark` swaps the call button to the translucent treatment the navy bands use,
 * because a navy pill on a navy band is invisible.
 */
export function ContactButtons({
  phone,
  email,
  onDark = false,
}: {
  phone: string | null;
  email: string | null;
  onDark?: boolean;
}) {
  return (
    <div className={onDark ? "contact-inline contact-inline-on-dark" : "contact-inline"} aria-label="Contact the school office">
      {channels(phone, email).map((item) => (
        <a
          key={item.key}
          href={item.href}
          className={`contact-pill contact-pill-inline contact-${item.key}`}
          data-unpublished={item.available ? undefined : "true"}
          aria-label={item.ariaLabel}
          title={item.ariaLabel}
          {...(item.key === "whatsapp" && item.available
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
        >
          <Icon channel={item.key} />
          <span>{item.label}</span>
          {!item.available && <span className="contact-dot" aria-hidden="true" />}
        </a>
      ))}
    </div>
  );
}
