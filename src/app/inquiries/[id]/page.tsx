import { notFound } from "next/navigation";

import { InquiryHeader } from "@/components/inquiry-header";
import { PageHeader } from "@/components/page-header";
import { ProposalHistory } from "@/components/proposal-history";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getInquiryWithEvents, getProposalsForInquiry } from "@/lib/db/queries";
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
  const proposals = await getProposalsForInquiry(id);

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

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <InquiryHeader inquiry={inquiry} />
          <ProposalHistory proposals={proposals} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assistant</CardTitle>
              <CardDescription>
                Chat that shortlists products from the content library.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-12 text-center text-sm">
                Coming in D9.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Proposal builder</CardTitle>
              <CardDescription>The working draft, and the button that creates it.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-12 text-center text-sm">
                Coming in D8.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
