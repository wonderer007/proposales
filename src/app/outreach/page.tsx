import { LeadTable } from "@/components/outreach/lead-table";
import { OutreachRange } from "@/components/outreach/outreach-range";
import { PageHeader } from "@/components/page-header";
import { addDays } from "@/lib/outreach/cadence";
import { scanForLeads } from "@/lib/outreach/scan";
import { DEFAULT_RANGE_DAYS, getToday, isIsoDate } from "@/lib/outreach/today";

export const metadata = {
  title: "Outreach",
};

/** Classification can be slow on a cold history; the scan is capped to fit. */
export const maxDuration = 60;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OutreachPage({ searchParams }: PageProps<"/outreach">) {
  const params = await searchParams;

  const today = getToday(params.today);
  const rawFrom = first(params.from);
  const rawTo = first(params.to);

  // Default window: today through today + 60 days.
  const from = rawFrom && isIsoDate(rawFrom) ? rawFrom : today;
  const to = rawTo && isIsoDate(rawTo) ? rawTo : addDays(today, DEFAULT_RANGE_DAYS);

  const { leads, stillUnclassified, classifyFailed } = await scanForLeads({ today, from, to });

  // Carried onto the row links so time-travel survives a click through.
  const search = new URLSearchParams(
    Object.entries({ today: first(params.today), from, to }).filter(
      (entry): entry is [string, string] => Boolean(entry[1]),
    ),
  ).toString();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <PageHeader
        title="Outreach radar"
        description="Past customers whose event is due round again, so you can get in touch before they go elsewhere."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <OutreachRange from={from} to={to} />
        {leads.length > 0 ? (
          <p className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
            {leads.length} {leads.length === 1 ? "lead" : "leads"}
          </p>
        ) : null}
      </div>

      {stillUnclassified > 0 ? (
        <p className="text-muted-foreground mb-4 text-xs">
          {stillUnclassified} older {stillUnclassified === 1 ? "inquiry has" : "inquiries have"} not
          been read for cadence yet
          {classifyFailed > 0 ? " (some could not be read this time)" : ""}. Find leads again to
          continue.
        </p>
      ) : null}

      {leads.length > 0 ? (
        <div className="overflow-hidden rounded-lg border">
          <LeadTable leads={leads} search={search ? `?${search}` : ""} />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed px-6 py-16 text-center">
          <p className="font-medium">No one to contact between these dates</p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-prose text-sm">
            A customer appears here when their event is due round again and you are not already
            talking to them about it. Widen the range, or run{" "}
            <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
              bun run outreach:seed
            </code>{" "}
            for samples.
          </p>
        </div>
      )}
    </main>
  );
}
