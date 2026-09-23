import { Mail, Phone } from "lucide-react";
import { notFound } from "next/navigation";

import { AcceptCadence } from "@/components/outreach/accept-cadence";
import { CustomerHistory } from "@/components/outreach/customer-history";
import { DraftMessage } from "@/components/outreach/draft-message";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateCompact } from "@/lib/format";
import { CADENCE_BADGE, OUTCOME_BADGE } from "@/lib/outreach/badges";
import { addDays } from "@/lib/outreach/cadence";
import { EXCLUSION_TEXT, getLeadDetail } from "@/lib/outreach/lead-detail";
import { draftMessageForLead } from "@/lib/outreach/message";
import { DEFAULT_RANGE_DAYS, getToday, isIsoDate } from "@/lib/outreach/today";

export const maxDuration = 60;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params }: PageProps<"/outreach/[inquiryId]">) {
  const { inquiryId } = await params;
  const detail = await getLeadDetail(inquiryId, {
    today: getToday(),
    from: getToday(),
    to: getToday(),
  }).catch(() => null);

  return { title: detail ? detail.customer.contactName : "Outreach" };
}

export default async function OutreachLeadPage({
  params,
  searchParams,
}: PageProps<"/outreach/[inquiryId]">) {
  const { inquiryId } = await params;
  const query = await searchParams;

  const today = getToday(query.today);
  const rawFrom = first(query.from);
  const rawTo = first(query.to);
  const from = rawFrom && isIsoDate(rawFrom) ? rawFrom : today;
  const to = rawTo && isIsoDate(rawTo) ? rawTo : addDays(today, DEFAULT_RANGE_DAYS);

  const detail = await getLeadDetail(inquiryId, { today, from, to });
  if (!detail) notFound();

  const { customer, lead, exclusion } = detail;
  const cadence = CADENCE_BADGE[customer.cadence];
  const outcome = OUTCOME_BADGE[customer.outcome];

  // The radar's range travels with the manager, so going back lands on the
  // same scan they came from.
  const backSearch = new URLSearchParams(
    Object.entries({ today: first(query.today), from, to }).filter(
      (entry): entry is [string, string] => Boolean(entry[1]),
    ),
  ).toString();

  // Drafted on load, as specced. A failure hands the manager an empty box and
  // a Regenerate button rather than a broken page.
  const drafted = lead
    ? await draftMessageForLead(lead).then(
        (text) => ({ text, error: null }),
        () => ({ text: "", error: "Could not draft a message. Try Regenerate." }),
      )
    : { text: "", error: null };

  // Only offer the suggestion when the threshold is what is holding it back.
  const suggestion =
    customer.cadence === "unknown" &&
    customer.suggestedCadence &&
    customer.suggestedCadence !== "unknown" &&
    customer.cadenceSource !== "manager"
      ? customer.suggestedCadence
      : null;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <PageHeader
        back={{ href: `/outreach${backSearch ? `?${backSearch}` : ""}`, label: "Outreach radar" }}
        title={customer.contactName}
        description={customer.companyName ?? undefined}
        actions={
          <span className="flex items-center gap-2">
            <Badge variant={cadence.variant} className={cadence.className}>
              {cadence.label}
            </Badge>
            <Badge variant={outcome.variant} className={outcome.className}>
              {outcome.label}
            </Badge>
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="flex items-center gap-2">
                <Mail className="text-muted-foreground size-4" aria-hidden />
                <a href={`mailto:${customer.email}`} className="hover:underline">
                  {customer.email}
                </a>
              </p>
              {customer.phone ? (
                <p className="flex items-center gap-2">
                  <Phone className="text-muted-foreground size-4" aria-hidden />
                  <a href={`tel:${customer.phone}`} className="hover:underline">
                    {customer.phone}
                  </a>
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History with us</CardTitle>
              <CardDescription>
                {customer.inquiries.length}{" "}
                {customer.inquiries.length === 1 ? "inquiry" : "inquiries"}, oldest first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CustomerHistory customer={customer} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recommendation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {lead ? (
                <>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                    <dt className="text-muted-foreground">Contact on</dt>
                    <dd className="font-medium tabular-nums">
                      {formatDateCompact(lead.recommendedContactDate)}
                    </dd>
                    <dt className="text-muted-foreground">Event expected</dt>
                    <dd className="tabular-nums">
                      {formatDateCompact(lead.nextExpectedDate)}
                    </dd>
                    <dt className="text-muted-foreground">Cadence</dt>
                    <dd>{cadence.label}</dd>
                  </dl>
                  <p className="text-muted-foreground">{lead.reasoning}</p>
                </>
              ) : (
                <p className="text-muted-foreground">
                  {exclusion ? EXCLUSION_TEXT[exclusion] : "Not a lead right now."}
                </p>
              )}

              {suggestion ? (
                <AcceptCadence
                  inquiryId={customer.inquiries[0].id}
                  cadence={suggestion}
                  confidence={customer.cadenceConfidence}
                  evidence={customer.cadenceEvidence}
                />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Draft message</CardTitle>
              <CardDescription>
                Yours to edit and send — nothing is sent from here. Marking as contacted hides this
                customer from the radar for 90 days.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {lead ? (
                <DraftMessage
                  inquiryId={inquiryId}
                  today={today}
                  from={from}
                  to={to}
                  initialMessage={drafted.text}
                  initialError={drafted.error}
                  contacted={false}
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  A message is drafted once this customer is due to be contacted.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
