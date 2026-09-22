import { notFound } from "next/navigation";

import { InquiryHeader } from "@/components/inquiry-header";
import { PageHeader } from "@/components/page-header";
import { ProposalPanel } from "@/components/proposal-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parseDraft } from "@/lib/builder/draft";
import { checkReadiness } from "@/lib/builder/readiness";
import { getContentLibrary } from "@/lib/content/library";
import { getActiveProposal, getInquiryWithEvents, getProposalsForInquiry } from "@/lib/db/queries";
import { formatTimestamp } from "@/lib/format";
import { refreshProposalStatuses } from "@/lib/proposals/refresh";

export async function generateMetadata({ params }: PageProps<"/inquiries/[id]">) {
  const { id } = await params;
  const inquiry = await getInquiryWithEvents(id);

  // The root layout's title template appends the app name.
  return { title: inquiry ? inquiry.contactName : "Inquiry" };
}

export default async function InquiryDetailPage({ params }: PageProps<"/inquiries/[id]">) {
  const { id } = await params;
  const inquiry = await getInquiryWithEvents(id);

  if (!inquiry) notFound();

  // Best effort; a Proposales outage must not take the page down.
  await refreshProposalStatuses(id);
  const [proposals, activeProposal] = await Promise.all([
    getProposalsForInquiry(id),
    getActiveProposal(id),
  ]);

  const draft = parseDraft(inquiry.workingDraft, inquiry.language);

  // A library outage must not blank the card, so fall back to accepting the
  // variation ids already on the draft rather than calling every line unknown.
  const knownVariationIds = await getContentLibrary()
    .then((products) => new Set(products.map((product) => product.variationId)))
    .catch(() => new Set(draft.items.map((item) => item.variationId)));

  const readiness = checkReadiness(draft, {
    knownVariationIds,
    today: new Date().toISOString().slice(0, 10),
  });

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
      <PageHeader
        back={{ href: "/", label: "Inquiries" }}
        title={inquiry.contactName}
        description={
          <>
            {inquiry.companyName ? `${inquiry.companyName}, received ` : "Received "}
            <time dateTime={inquiry.createdAt.toISOString()} className="tabular-nums">
              {formatTimestamp(inquiry.createdAt)}
            </time>
          </>
        }
        actions={
          <Badge variant="outline">{inquiry.language === "sv" ? "Svenska" : "English"}</Badge>
        }
      />

      {/*
        Two columns on desktop. The assistant is where the manager spends the
        session, so it gets the wider column and stays pinned while the
        inquiry and proposal panel scroll past on the left.
      */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="space-y-6">
          <InquiryHeader inquiry={inquiry} />
          <ProposalPanel
            inquiryId={inquiry.id}
            draft={draft}
            readiness={readiness}
            activeProposalStatus={activeProposal?.status ?? null}
            proposals={proposals}
          />
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <Card className="flex flex-col lg:h-[calc(100dvh-6rem)] lg:min-h-[32rem]">
            <CardHeader>
              <CardTitle>Assistant</CardTitle>
              <CardDescription>
                Chat that shortlists products from the content library.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <p className="text-muted-foreground flex flex-1 items-center justify-center rounded-lg border border-dashed px-4 py-12 text-center text-sm">
                Coming in D9.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
