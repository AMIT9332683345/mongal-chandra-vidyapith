import Link from "next/link";
import { ActionForm } from "@/components/cms-form";
import { NoticeFields } from "@/components/notice-fields";
import { PanelShell } from "@/components/panel-shell";
import { listNoticeCategories } from "@/server/content/site";
import { saveNoticeAction } from "@/server/content/actions";
import { makeCsrfToken } from "@/server/auth/session";
import { requirePanel } from "@/server/auth/gate";
import { pageMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Draft a notice",
  description: "Write a notice for the school board.",
  path: "/portal/content/notices/new",
  noIndex: true,
});

export default async function NewNoticePage() {
  const actor = await requirePanel("notice.create", "/portal/content/notices/new");
  const categories = await listNoticeCategories();

  return (
    <PanelShell
      actor={actor}
      active="/portal/content/notices"
      eyebrow="Notice board"
      title="Draft a notice"
      intro="A new notice is saved as a draft. It stays invisible to the public until it is published from its own page, where the scheduling and pinning controls are."
    >
      <ActionForm
        action={saveNoticeAction}
        csrfToken={makeCsrfToken(actor.sessionId)}
        submitLabel="Save the draft"
        editLinkPrefix="/portal/content/notices/"
        className="max-w-3xl"
      >
        <NoticeFields uid="new-notice" categories={categories} />
      </ActionForm>

      <p className="mt-8 text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
        Attaching a signed circular or an order in PDF is done from the notice&apos;s own page, after it exists.{" "}
        <Link href="/portal/content/notices" style={{ color: "var(--accent)" }}>
          Back to the board
        </Link>
        .
      </p>
    </PanelShell>
  );
}
