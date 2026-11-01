import Link from "next/link";
import { HeroSlider } from "@/components/hero-slider";
import { CampusPhoto } from "@/components/campus-photo";
import { EventList } from "@/components/event-list";
import { NoticeList } from "@/components/notice-list";
import { StoredPhoto } from "@/components/stored-photo";
import { SchoolStructuredData } from "@/components/school-structured-data";
import { EmptyState, InfoGap, SectionHeading } from "@/components/section-heading";
import { ContactButtons } from "@/components/contact-actions";
import {
  getCurrentAcademicYear,
  getSchoolName,
  getSettings,
  listEventCategories,
  listHeroSlides,
  listHomepageSections,
  listPublishedAlbums,
  listPublishedFaqs,
  listPublishedTestimonials,
  listPublicAchievements,
  listPublicClasses,
  listPublicFacilities,
  listPublicMilestones,
  listPublicNotices,
  listRecentGalleryItems,
  listUpcomingEvents,
  settingText,
} from "@/server/content/site";
import { formatDate } from "@/lib/format";

export const revalidate = 300;

const FEATURE_CARDS = [
  {
    href: "/admissions/apply",
    title: "Admissions",
    body: "Start an application online and follow it by reference number at every stage.",
    icon: "cap",
  },
  {
    href: "/academics",
    title: "Academics",
    body: "The classes the school runs, the curriculum it follows, and its results.",
    icon: "book",
  },
  {
    href: "/notices",
    title: "Notice board",
    body: "Every circular, dated and searchable, with pinned items kept at the top.",
    icon: "bell",
  },
  {
    href: "/gallery",
    title: "Photo gallery",
    body: "School life in pictures, published only with consent for every pupil shown.",
    icon: "image",
  },
  {
    href: "/downloads",
    title: "Downloads",
    body: "Forms, syllabi and office circulars, ready to open or print.",
    icon: "download",
  },
] as const;

const ROLE_LABEL: Record<string, string> = {
  parent: "Parent",
  alumnus: "Alumnus",
  student: "Student",
  teacher: "Teacher",
  wellwisher: "Well-wisher",
};

function sectionBody(
  sections: Awaited<ReturnType<typeof listHomepageSections>>,
  key: string,
): string | null {
  const section = sections.find((item) => item.sectionKey === key);
  const body = section?.body?.trim();
  return body ? body : null;
}

function settingCount(settings: Awaited<ReturnType<typeof getSettings>>, key: string): number | null {
  const raw = settingText(settings, key);
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function FeatureIcon({ name }: { name: (typeof FEATURE_CARDS)[number]["icon"] }) {
  const common = {
    width: 26,
    height: 26,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  } as const;
  switch (name) {
    case "cap":
      return (
        <svg {...common}>
          <path d="M2 8.5 12 4l10 4.5-10 4.5L2 8.5Z" />
          <path d="M6 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
          <path d="M22 8.5V14" />
        </svg>
      );
    case "book":
      return (
        <svg {...common}>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z" />
          <path d="M4 20.5V5.5" />
          <path d="M8 7h8M8 11h6" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9Z" />
          <path d="M10 18a2 2 0 0 0 4 0" />
        </svg>
      );
    case "image":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="9.5" r="1.5" />
          <path d="m21 15-4.5-4.5L7 20" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      );
  }
}

export default async function HomePage() {
  const [
    schoolName,
    settings,
    sections,
    heroSlides,
    notices,
    upcoming,
    sportsUpcoming,
    classes,
    facilities,
    milestones,
    achievements,
    albums,
    recentPhotos,
    testimonials,
    faqs,
    academicYear,
    eventCategories,
  ] = await Promise.all([
    getSchoolName(),
    getSettings(),
    listHomepageSections(),
    listHeroSlides(6),
    listPublicNotices({ limit: 6 }),
    listUpcomingEvents(3),
    listUpcomingEvents(3, "sports"),
    listPublicClasses(),
    listPublicFacilities(),
    listPublicMilestones(),
    listPublicAchievements(6),
    listPublishedAlbums(8),
    listRecentGalleryItems(8),
    listPublishedTestimonials(6),
    listPublishedFaqs(),
    getCurrentAcademicYear(),
    listEventCategories(),
  ]);

  const establishedYear = settingText(settings, "school.established_year");
  const principalName = settingText(settings, "school.principal_name");
  const board = settingText(settings, "school.board");
  const address = settingText(settings, "school.address");
  const mapUrl = settingText(settings, "school.map_url");
  const phone = settingText(settings, "school.phone");
  const email = settingText(settings, "school.email");
  const vision =
    sectionBody(sections, "vision") ??
    settingText(settings, "school.vision") ??
    settingText(settings, "school.mission");
  const welcome = sectionBody(sections, "welcome");
  const principalMessage =
    sectionBody(sections, "principal_message") ?? settingText(settings, "school.principal_message");

  const admissionFrom = settingText(settings, "admission.open_from") ?? academicYear?.admissionOpenFrom ?? null;
  const admissionTo = settingText(settings, "admission.open_to") ?? academicYear?.admissionOpenTo ?? null;

  const celebrationCategoryKeys = eventCategories
    .filter((category) => category.group === "Celebration")
    .map((category) => category.name);

  const stats = [
    establishedYear ? { value: establishedYear, label: "Established" } : null,
    settingCount(settings, "school.student_count")
      ? { value: String(settingCount(settings, "school.student_count")), label: "Students on roll" }
      : null,
    settingCount(settings, "school.teacher_count")
      ? { value: String(settingCount(settings, "school.teacher_count")), label: "Teachers" }
      : null,
    classes.length > 0 ? { value: String(classes.length), label: "Classes offered" } : null,
    facilities.length > 0 ? { value: String(facilities.length), label: "Facilities on campus" } : null,
    albums.length > 0 ? { value: String(albums.length), label: "Photo albums" } : null,
  ]
    .filter((entry): entry is { value: string; label: string } => entry !== null)
    .slice(0, 4);

  const leadPhoto = albums.find((album) => album.coverDocumentId) ?? null;
  const secondaryPhoto = albums.filter((album) => album.coverDocumentId)[1] ?? null;
  const latestNotice = notices[0] ?? null;

  return (
    <>
      <SchoolStructuredData />

      <HeroSlider
        slides={heroSlides.map((slide) => ({
          documentId: slide.documentId,
          alt: slide.alt,
          title: slide.title,
          caption: slide.caption,
          albumSlug: slide.albumSlug,
        }))}
        eyebrow={establishedYear ? `Established ${establishedYear}` : "Official school website"}
        heading={schoolName}
        intro={welcome}
        actions={[
          { href: "/admissions/apply", label: "Apply for admission", primary: true },
          { href: "/notices", label: "Current notices" },
        ]}
      />

      {latestNotice && (
        <div className="ticker">
          <div className="shell flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[0.88rem]">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#14203c] px-2.5 py-0.5 text-[0.72rem] font-bold uppercase tracking-[0.14em] text-[var(--gold)]">
              Latest
            </span>
            <Link href={`/notices/${latestNotice.slug}`} className="min-w-0 flex-1 truncate">
              {latestNotice.title}
            </Link>
            <span className="text-[0.78rem] opacity-80">{formatDate(latestNotice.issuedOn) ?? ""}</span>
            <Link href="/notices" className="text-[0.8rem] underline underline-offset-2">
              All notices
            </Link>
          </div>
        </div>
      )}

      {/* Welcome split: who the school is, in its own words. */}
      <section className="section">
        <div className="shell media-split">
          <div>
            <p className="eyebrow">Welcome</p>
            <h2 className="mt-2">A school built around its pupils</h2>
            {welcome ? (
              <p className="lede mt-4">{welcome}</p>
            ) : (
              <div className="mt-4">
                <InfoGap
                  label="Welcome message"
                  what="The office writes this paragraph in the content panel; the platform does not invent it."
                />
              </div>
            )}
            {vision && <p className="mt-4 text-[0.98rem]" style={{ color: "var(--ink-secondary)" }}>{vision}</p>}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/about" className="button button-primary">
                About the school
              </Link>
              <Link href="/contact" className="button button-secondary">
                Visit or contact us
              </Link>
            </div>
            <ul className="mt-7 grid list-none gap-3 sm:grid-cols-2">
              {[
                board ? `Curriculum: ${board}` : null,
                academicYear ? `Session: ${academicYear.name}` : null,
                admissionFrom || admissionTo ? "Admissions open now" : null,
                classes.length > 0 ? `${classes.length} classes offered` : null,
              ]
                .filter((line): line is string => Boolean(line))
                .map((line) => (
                  <li key={line} className="flex items-start gap-2 text-[0.92rem]" style={{ color: "var(--ink-secondary)" }}>
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ color: "var(--gold-ink)", flexShrink: 0, marginTop: 2 }}>
                      <path d="m5 12 4.5 4.5L19 7" />
                    </svg>
                    {line}
                  </li>
                ))}
            </ul>
          </div>

          <div className="relative">
            {leadPhoto?.coverDocumentId ? (
              <div className="media-frame">
                <StoredPhoto documentId={leadPhoto.coverDocumentId} alt={`Photograph from the album ${leadPhoto.title}`} />
              </div>
            ) : (
              <div className="grid place-items-center rounded-[var(--radius-lg)] border p-8" style={{ borderColor: "var(--line)", background: "var(--surface-raised)" }}>
                <CampusPhoto />
              </div>
            )}
            <div className="mt-4 flex items-center justify-between gap-4 rounded-[var(--radius)] border px-4 py-3" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
              <div>
                <p className="text-[0.78rem] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--gold-ink)" }}>
                  Admissions
                </p>
                <p className="mt-1 text-[0.92rem]" style={{ color: "var(--ink)" }}>
                  {admissionFrom || admissionTo
                    ? `${formatDate(admissionFrom) ?? admissionFrom ?? "—"} – ${formatDate(admissionTo) ?? admissionTo ?? "—"}`
                    : "Window not published yet"}
                </p>
              </div>
              <Link href="/admissions" className="link-arrow">
                How to apply
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* The numbers band. Only numbers the school has confirmed or that can be
          counted from published records appear here. */}
      {stats.length > 0 && (
        <section className="stat-band">
          <div className="shell grid grid-cols-2 gap-y-8 py-9 md:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="px-2 text-center md:border-r md:border-white/15 md:last:border-r-0">
                <p className="stat-value">{stat.value}</p>
                <p className="stat-label">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Five routes in, the way the reference school lays them out. */}
      <section className="section">
        <div className="shell">
          <SectionHeading
            eyebrow="Quick access"
            title="Where would you like to go?"
            description="The five things families ask for most, one click from the front page."
          />
          <ul className="grid list-none gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {FEATURE_CARDS.map((card) => (
              <li key={card.href}>
                <Link
                  href={card.href}
                  className="card-lift flex h-full flex-col rounded-[var(--radius-lg)] p-5 no-underline"
                >
                  <span
                    className="grid h-12 w-12 place-items-center rounded-full"
                    style={{ background: "var(--accent-soft)", color: "var(--brand)" }}
                  >
                    <FeatureIcon name={card.icon} />
                  </span>
                  <span className="mt-4 font-[family-name:var(--font-heading)] text-[1.05rem] font-bold" style={{ color: "var(--ink)" }}>
                    {card.title}
                  </span>
                  <span className="mt-1.5 flex-1 text-[0.88rem] leading-relaxed" style={{ color: "var(--ink-secondary)" }}>
                    {card.body}
                  </span>
                  <span className="mt-4 text-[0.8rem] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--gold-ink)" }}>
                    Open →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Notices and the diary, always the two most time-sensitive columns. */}
      <section className="section section-soft section-line">
        <div className="shell grid gap-12 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <SectionHeading eyebrow="Notice board" title="Latest notices" more={{ href: "/notices", label: "Full board" }} />
            <div className="mt-5 rounded-[var(--radius-lg)] border p-5" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
              {notices.length > 0 ? (
                <NoticeList notices={notices.slice(0, 5)} compact />
              ) : (
                <EmptyState title="Nothing on the board" note="Published notices appear here immediately." />
              )}
            </div>
          </div>
          <div>
            <SectionHeading eyebrow="School diary" title="Coming up" more={{ href: "/events", label: "Calendar" }} />
            <div className="mt-5 rounded-[var(--radius-lg)] border p-5" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
              {upcoming.length > 0 ? (
                <EventList events={upcoming} />
              ) : (
                <EmptyState title="No events are scheduled yet" note="Programmes appear here as soon as they are published." />
              )}
            </div>
            {celebrationsNote(celebrationCategoryKeys)}
          </div>
        </div>
      </section>

      {/* Principal's desk. */}
      <section className="section">
        <div className="shell media-split">
          <div
            className="relative overflow-hidden rounded-[var(--radius-lg)] p-8 text-white lg:p-10"
            style={{ background: "linear-gradient(140deg, var(--brand-deep), var(--brand))" }}
          >
            <span aria-hidden="true" className="block font-[family-name:var(--font-heading)] text-[5rem] leading-none" style={{ color: "var(--gold)" }}>
              &ldquo;
            </span>
            {principalMessage ? (
              <blockquote className="m-0 -mt-6 text-[1.06rem] leading-relaxed" style={{ color: "rgb(255 255 255 / 0.92)" }}>
                {principalMessage}
              </blockquote>
            ) : (
              <div className="-mt-6">
                <InfoGap
                  label="Principal&rsquo;s message"
                  what="Awaiting the principal's own words, entered under Content in the portal."
                />
              </div>
            )}
            <div className="mt-7 border-t pt-5" style={{ borderColor: "rgb(255 255 255 / 0.2)" }}>
              <p className="font-[family-name:var(--font-heading)] text-[1rem] font-bold">{principalName ?? "Principal"}</p>
              <p className="text-[0.85rem]" style={{ color: "rgba(255,255,255,0.72)" }}>
                {principalName ? "Principal, " : "Name not published, "}
                {schoolName}
              </p>
            </div>
          </div>

          <div>
            <p className="eyebrow">From the Principal&rsquo;s desk</p>
            <h2 className="mt-2">A word to families and pupils</h2>
            <p className="lede mt-4">
              {vision ??
                "The school publishes its vision and the principal's message here. Nothing is drafted on the school's behalf."}
            </p>
            <dl className="mt-7 grid gap-5 sm:grid-cols-2">
              <div className="rounded-[var(--radius)] border p-4" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
                <dt className="text-[0.75rem] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--gold-ink)" }}>
                  Curriculum
                </dt>
                <dd className="mt-1 text-[0.95rem]" style={{ color: "var(--ink)" }}>
                  {board ?? "Stated by the school once confirmed"}
                </dd>
              </div>
              <div className="rounded-[var(--radius)] border p-4" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
                <dt className="text-[0.75rem] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--gold-ink)" }}>
                  Session
                </dt>
                <dd className="mt-1 text-[0.95rem]" style={{ color: "var(--ink)" }}>
                  {academicYear?.name ?? "Not yet announced"}
                </dd>
              </div>
            </dl>
            <Link href="/about" className="link-arrow mt-6">
              Read about the school
            </Link>
          </div>
        </div>
      </section>

      {/* Academics, as an alternating media block. */}
      <section className="section section-soft section-line">
        <div className="shell media-split">
          <div>
            <p className="eyebrow">Academics</p>
            <h2 className="mt-2">Classes, curriculum and results</h2>
            <p className="lede mt-4">
              {sectionBody(sections, "academic_highlights") ??
                "The school states the classes it runs and the board it follows; the platform does not assume a curriculum."}
            </p>
            <div className="mt-6 overflow-x-auto rounded-[var(--radius)] border" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
              <table>
                <caption className="sr-only">Classes currently offered by the school</caption>
                <thead>
                  <tr>
                    <th scope="col">Class</th>
                    <th scope="col">Typical entry age</th>
                    <th scope="col">Admissions</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.length > 0 ? (
                    classes.slice(0, 6).map((row) => (
                      <tr key={row.id}>
                        <th scope="row" className="font-medium">{row.name}</th>
                        <td>{row.typicalAgeYears ? `${row.typicalAgeYears} years` : "—"}</td>
                        <td>{row.admissionOpen ? "Open" : "Closed"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} style={{ color: "var(--ink-muted)" }}>
                        No classes have been configured yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Link href="/academics" className="link-arrow mt-6">
              All academics
            </Link>
          </div>
          <div>
            {secondaryPhoto?.coverDocumentId ? (
              <div className="media-frame">
                <StoredPhoto documentId={secondaryPhoto.coverDocumentId} alt={`Photograph from the album ${secondaryPhoto.title}`} />
              </div>
            ) : (
              <div className="grid aspect-[4/3] place-items-center rounded-[var(--radius-lg)] border p-10" style={{ borderColor: "var(--line)", background: "var(--surface-raised)" }}>
                <p className="max-w-xs text-center text-[0.9rem]" style={{ color: "var(--ink-muted)" }}>
                  Photographs of classrooms appear here once an album is published.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Sport and school life. */}
      <section className="section">
        <div className="shell media-split is-reverse">
          <div>
            <p className="eyebrow">Beyond the classroom</p>
            <h2 className="mt-2">Sport, celebration and school life</h2>
            <p className="lede mt-4">
              {sectionBody(sections, "sports") ??
                "Games, teams and fixtures are described by the school; nothing is invented here."}
            </p>
            {sectionBody(sections, "celebrations") && (
              <p className="mt-4 text-[0.98rem]" style={{ color: "var(--ink-secondary)" }}>
                {sectionBody(sections, "celebrations")}
              </p>
            )}
            <Link href="/facilities" className="link-arrow mt-6">
              Grounds and facilities
            </Link>
          </div>
          <div className="rounded-[var(--radius-lg)] border p-5" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
            <p className="font-[family-name:var(--font-heading)] text-[1rem] font-bold" style={{ color: "var(--ink)" }}>
              Fixtures and programmes in the diary
            </p>
            <div className="mt-3">
              {sportsUpcoming.length > 0 ? (
                <EventList events={sportsUpcoming} />
              ) : (
                <p className="text-[0.9rem]" style={{ color: "var(--ink-muted)" }}>
                  No sports events are published in the calendar right now.
                </p>
              )}
            </div>
            <Link href="/events" className="link-arrow mt-4">
              Open the calendar
            </Link>
          </div>
        </div>
      </section>

      {/* Gallery strip. */}
      <section className="section section-soft section-line">
        <div className="shell">
          <SectionHeading
            eyebrow="Gallery"
            title="Life at the school"
            description="Every photograph is published only after consent for each identifiable pupil has been recorded."
            more={{ href: "/gallery", label: "Open the gallery" }}
          />
          {recentPhotos.length > 0 ? (
            <ul className="mt-7 grid list-none grid-cols-2 gap-3 md:grid-cols-4">
              {recentPhotos.slice(0, 8).map((photo, position) => (
                <li key={photo.id} className={position % 5 === 0 ? "md:row-span-2" : ""}>
                  <Link href={`/gallery/${photo.albumSlug}`} className="group block h-full overflow-hidden rounded-[var(--radius)]">
                    <span className={position % 5 === 0 ? "block aspect-[3/4] overflow-hidden" : "block aspect-[3/2] overflow-hidden"}>
                      <StoredPhoto
                        documentId={photo.documentId}
                        alt={photo.caption ?? `Photograph from ${photo.albumTitle}`}
                        className="h-full w-full transition-transform duration-500 group-hover:scale-105"
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : albums.length > 0 ? (
            <ul className="mt-7 grid list-none gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {albums.slice(0, 4).map((album) => (
                <li key={album.id}>
                  <Link href={`/gallery/${album.slug}`} className="card-lift block overflow-hidden no-underline">
                    {album.coverDocumentId ? (
                      <StoredPhoto documentId={album.coverDocumentId} alt={`Cover photograph from the album ${album.title}`} />
                    ) : (
                      <div className="aspect-[3/2]" style={{ background: "var(--surface-raised)" }} aria-hidden="true" />
                    )}
                    <span className="block px-4 py-3 font-[family-name:var(--font-heading)] text-[0.98rem] font-semibold" style={{ color: "var(--ink)" }}>
                      {album.title}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-7">
              <EmptyState
                title="No albums have been published"
                note="An album goes live only once consent for every identifiable pupil in it has been recorded."
              />
            </div>
          )}
        </div>
      </section>

      {/* Awards and results. */}
      <section className="section">
        <div className="shell grid gap-12 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <SectionHeading
              eyebrow="Recognition"
              title="Awards and results"
              description="School-level outcomes only. An individual pupil's marks never appear here; they stay inside the protected report-card flow."
            />
            <Link href="/results" className="link-arrow mt-5">
              Results and achievements
            </Link>
          </div>
          <div>
            {achievements.length > 0 ? (
              <dl className="grid gap-4 sm:grid-cols-2">
                {achievements.map((achievement) => (
                  <div
                    key={`${achievement.title}-${achievement.achievedOn ?? ""}`}
                    className="rounded-[var(--radius)] border-l-4 p-4"
                    style={{ borderColor: "var(--gold)", background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
                  >
                    <dt className="font-[family-name:var(--font-heading)] text-[0.98rem] font-bold" style={{ color: "var(--ink)" }}>
                      {achievement.title}
                    </dt>
                    <dd className="mt-1 text-[0.88rem]" style={{ color: "var(--ink-secondary)" }}>
                      {achievement.description ?? achievement.eventName ?? achievement.awardingBody ?? formatDate(achievement.achievedOn) ?? ""}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <InfoGap label="Achievements" what="Awards and published statistics are entered only from a verified result set." />
            )}
          </div>
        </div>
      </section>

      {/* Testimonials, once families have consented to being quoted. */}
      {testimonials.length > 0 && (
        <section className="section section-soft section-line">
          <div className="shell">
            <SectionHeading
              eyebrow="In their words"
              title="What our families say"
              description="Quotes published only with the named person's consent."
            />
            <ul className="mt-7 grid list-none gap-5 md:grid-cols-3">
              {testimonials.slice(0, 3).map((entry) => (
                <li key={entry.id} className="flex flex-col rounded-[var(--radius-lg)] border p-6" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
                  <span aria-hidden="true" className="font-[family-name:var(--font-heading)] text-[2.6rem] leading-none" style={{ color: "var(--gold)" }}>
                    &ldquo;
                  </span>
                  <blockquote className="m-0 -mt-3 flex-1 text-[0.97rem] leading-relaxed" style={{ color: "var(--ink-secondary)" }}>
                    {entry.quote}
                  </blockquote>
                  <div className="mt-5 flex items-center gap-3 border-t pt-4" style={{ borderColor: "var(--line)" }}>
                    {entry.imageDocumentId ? (
                      <span className="h-10 w-10 overflow-hidden rounded-full">
                        <StoredPhoto documentId={entry.imageDocumentId} alt="" className="h-full w-full" />
                      </span>
                    ) : (
                      <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-full font-bold" style={{ background: "var(--accent-soft)", color: "var(--brand)" }}>
                        {entry.authorName.charAt(0)}
                      </span>
                    )}
                    <span>
                      <span className="block text-[0.92rem] font-bold" style={{ color: "var(--ink)" }}>
                        {entry.authorName}
                      </span>
                      <span className="block text-[0.8rem]" style={{ color: "var(--ink-muted)" }}>
                        {entry.authorDetail ?? ROLE_LABEL[entry.authorRole] ?? "Well-wisher"}
                      </span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Admissions call to action. */}
      <section className="section-tight">
        <div className="shell">
          <div className="cta-banner px-6 py-10 md:px-10">
            <div className="relative z-[1] grid items-center gap-7 md:grid-cols-[1.6fr_1fr]">
              <div>
                <p className="eyebrow" style={{ color: "var(--gold)" }}>
                  Admissions
                </p>
                <h2 className="mt-2">Applying to {schoolName}</h2>
                <p className="mt-3 max-w-2xl">
                  {admissionFrom || admissionTo
                    ? `The current window runs from ${formatDate(admissionFrom) ?? admissionFrom ?? "—"} to ${formatDate(admissionTo) ?? admissionTo ?? "—"}. Applications are made online and tracked by reference number.`
                    : "The school has not published an admission window for this session. Send an enquiry and the office will confirm the dates."}
                </p>
              </div>
              <div className="flex flex-wrap gap-3 md:justify-end">
                <Link href="/admissions/apply" className="button button-gold">
                  Start an application
                </Link>
                <Link href="/admissions" className="button button-outline-light">
                  Procedure and documents
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The three ways to reach the office, in the flow of the page as well as
          fixed over it. */}
      <section className="section-tight">
        <div className="shell">
          <div className="cta-banner px-6 py-9 md:px-10">
            <div className="relative z-[1] grid items-center gap-6 md:grid-cols-[1.5fr_auto]">
              <div>
                <p className="eyebrow" style={{ color: "var(--gold)" }}>
                  Talk to the office
                </p>
                <h2 className="mt-2">Call, message or write</h2>
                <p className="mt-3 max-w-xl">
                  Whichever suits you — the office answers the telephone, replies on WhatsApp and reads its email. The
                  contact form is there for when the office is closed.
                </p>
              </div>
              <ContactButtons phone={phone} email={email} onDark />
            </div>
          </div>
        </div>
      </section>

      {/* FAQs. */}
      <section className="section-tight">
        <div className="shell grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="eyebrow">Questions</p>
            <h2 className="mt-2">Common enquiries</h2>
            <p className="mt-3 text-[0.95rem]" style={{ color: "var(--ink-secondary)" }}>
              Answered by the office. If yours is not here, write to us and a person will reply.
            </p>
            <Link href="/contact" className="link-arrow mt-5">
              Contact the office
            </Link>
          </div>
          <div>
            {faqs.length > 0 ? (
              <div className="divide-y" style={{ borderColor: "var(--line)" }}>
                {faqs.slice(0, 5).map((faq) => (
                  <details key={faq.question} className="group py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-[family-name:var(--font-heading)] text-[1rem] font-semibold" style={{ color: "var(--ink)" }}>
                      {faq.question}
                      <span aria-hidden="true" className="text-[1.3rem] leading-none" style={{ color: "var(--gold-ink)" }}>
                        +
                      </span>
                    </summary>
                    <p className="mt-2 text-[0.93rem]" style={{ color: "var(--ink-secondary)" }}>
                      {faq.answer}
                    </p>
                  </details>
                ))}
              </div>
            ) : (
              <InfoGap
                label="Frequently asked questions"
                what="The office writes these; the platform will not guess an answer about fees, transport or timings."
              />
            )}
          </div>
        </div>
      </section>

      {/* Contact strip. */}
      <section className="section-tight section-soft section-line">
        <div className="shell grid gap-8 md:grid-cols-3">
          <div>
            <p className="eyebrow">Visit</p>
            {address ? (
              <address className="mt-2 text-[0.95rem] not-italic" style={{ color: "var(--ink-secondary)" }}>
                {address.split("\n").map((line) => (
                  <span key={line} className="block">{line}</span>
                ))}
              </address>
            ) : (
              <p className="mt-2 text-[0.9rem]" style={{ color: "var(--ink-muted)" }}>
                Postal address not published yet.
              </p>
            )}
          </div>
          <div>
            <p className="eyebrow">Call or write</p>
            <ul className="mt-2 flex list-none flex-col gap-1 text-[0.95rem]">
              {phone ? (
                <li>
                  <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} style={{ color: "var(--ink-secondary)" }}>{phone}</a>
                </li>
              ) : null}
              {email ? (
                <li>
                  <a href={`mailto:${email}`} style={{ color: "var(--ink-secondary)" }}>{email}</a>
                </li>
              ) : null}
              {!phone && !email && <li style={{ color: "var(--ink-muted)" }}>Contact details not published yet.</li>}
            </ul>
          </div>
          <div>
            <p className="eyebrow">Find us</p>
            {mapUrl ? (
              <a href={mapUrl} className="button button-secondary mt-2" target="_blank" rel="noopener noreferrer">
                Open the campus map
              </a>
            ) : (
              <p className="mt-2 text-[0.9rem]" style={{ color: "var(--ink-muted)" }}>
                A location is not plotted from an unconfirmed address.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* History, when the school has recorded it. */}
      {milestones.length > 0 && (
        <section className="section-tight">
          <div className="shell">
            <SectionHeading eyebrow="History" title="Milestones" more={{ href: "/about", label: "Our story" }} />
            <ol className="mt-6 grid list-none gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {milestones.slice(0, 6).map((milestone) => (
                <li key={`${milestone.periodLabel}-${milestone.title}`} className="rounded-[var(--radius)] border-l-4 p-4" style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}>
                  <span className="block text-[0.8rem] font-bold tabular-nums" style={{ color: "var(--accent)" }}>
                    {milestone.periodLabel}
                  </span>
                  <span className="mt-1 block font-semibold" style={{ color: "var(--ink)" }}>
                    {milestone.title}
                  </span>
                  {milestone.description && (
                    <span className="mt-1 block text-[0.86rem]" style={{ color: "var(--ink-secondary)" }}>
                      {milestone.description}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}
    </>
  );
}

function celebrationsNote(categoryKeys: string[]) {
  if (categoryKeys.length === 0) return null;
  return (
    <p className="mt-3 text-[0.82rem]" style={{ color: "var(--ink-muted)" }}>
      Celebration categories published by the school: {categoryKeys.join(", ")}.{" "}
      <Link href="/events?group=Celebration" className="underline underline-offset-2">
        See all
      </Link>
    </p>
  );
}
