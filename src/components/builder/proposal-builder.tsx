import { AlertTriangle, Info, Sparkles } from "lucide-react";

import { DateConfirm } from "@/components/builder/date-confirm";
import { ItemOptions } from "@/components/builder/item-options";
import { ItemSuggestionCard } from "@/components/builder/item-suggestion";
import { DismissFlagButton } from "@/components/builder/dismiss-flag-button";
import { QuantityInput } from "@/components/builder/quantity-input";
import { RemoveItemButton } from "@/components/builder/remove-item-button";
import { SubmitProposalButton } from "@/components/builder/submit-proposal-button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { proposalAction, proposalActionLabel } from "@/lib/builder/action-label";
import type { DraftEvent, DraftItem, WorkingDraft } from "@/lib/builder/draft";
import type { Readiness } from "@/lib/builder/readiness";
import { calculateTotals, formatMoney } from "@/lib/builder/totals";
import { formatDate, formatTime } from "@/lib/format";
import { cn } from "cn";

/** Marks a value the agent inferred rather than being told (SPEC §4.4). */
function InferredMark({ field }: { field: string }) {
  return (
    // Scoped provider: nothing else in the app uses tooltips yet, so there is
    // no app-level one to rely on.
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground inline-flex cursor-help items-center align-middle">
            <Sparkles className="size-3" aria-label={`${field} was inferred`} />
          </span>
        </TooltipTrigger>
        <TooltipContent>Inferred from the inquiry — check it is right.</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Compact badges showing what the recipient may do with a line. */
function ItemStateBadges({ item }: { item: DraftItem }) {
  const range =
    item.quantityMin !== null && item.quantityMax !== null
      ? `${item.quantityMin}–${item.quantityMax}`
      : item.quantityMin !== null
        ? `from ${item.quantityMin}`
        : item.quantityMax !== null
          ? `up to ${item.quantityMax}`
          : null;

  return (
    <>
      {item.role === "addon" ? (
        <Badge variant="outline" className="align-middle">
          add-on
        </Badge>
      ) : null}
      {item.optional ? (
        <Badge variant="secondary" className="align-middle">
          optional
        </Badge>
      ) : null}
      {item.quantityEditable ? (
        <Badge variant="outline" className="align-middle">
          flexible{range ? ` ${range}` : ""}
        </Badge>
      ) : null}
    </>
  );
}

function EventHeading({
  inquiryId,
  event,
}: {
  inquiryId: string;
  event: DraftEvent;
}) {
  const inferred = new Set(event.inferred);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">
          {event.label ?? event.type}
          <Badge variant="outline" className="ml-2 align-middle">
            {event.type}
          </Badge>
        </p>
        <p className="text-muted-foreground text-xs">
          <span className={cn(!event.date && "text-destructive")}>
            {event.date ? formatDate(event.date) : "No date yet"}
          </span>
          {inferred.has("date") ? <InferredMark field="Date" /> : null}
          {" · "}
          <span className={cn((!event.startTime || !event.endTime) && "text-destructive")}>
            {event.startTime && event.endTime
              ? `${formatTime(event.startTime)}–${formatTime(event.endTime)}`
              : "No time yet"}
          </span>
          {inferred.has("time") ? <InferredMark field="Time" /> : null}
          {" · "}
          <span className={cn(!event.headcount && "text-destructive")}>
            {event.headcount ? `${event.headcount} guests` : "No headcount"}
          </span>
          {inferred.has("headcount") ? <InferredMark field="Headcount" /> : null}
        </p>
      </div>

      <DateConfirm
        inquiryId={inquiryId}
        eventId={event.id}
        confirmed={event.dateConfirmed}
        disabled={!event.date}
      />
    </div>
  );
}

export function ProposalBuilder({
  inquiryId,
  draft,
  readiness,
  activeProposalStatus,
}: {
  inquiryId: string;
  draft: WorkingDraft;
  readiness: Readiness;
  activeProposalStatus: string | null;
}) {
  const totals = calculateTotals(draft);
  const action = proposalAction(activeProposalStatus);
  const label = proposalActionLabel(action);

  if (draft.events.length === 0 && draft.items.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-12 text-center text-sm">
          Nothing shortlisted yet. Ask the assistant what the customer needs and the draft will
          fill in here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {draft.events.map((event) => {
        const items = draft.items.filter((item) => item.eventId === event.id);

        return (
          <section key={event.id} className="space-y-3 rounded-lg border p-3">
            <EventHeading inquiryId={inquiryId} event={event} />

            {items.length === 0 ? (
              <p className="text-muted-foreground text-xs">Nothing selected for this event yet.</p>
            ) : (
              <ul className="divide-y">
                {items.map((item) => {
                  // Optional lines are absent from the committed breakdown, so
                  // fall back to the maximum one — the row must still show what
                  // the line costs if the customer takes it.
                  const line =
                    totals.lines.find((candidate) => candidate.itemId === item.id) ??
                    totals.maximum.lines.find((candidate) => candidate.itemId === item.id);

                  return (
                    <li key={item.id} className="py-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <div className="min-w-40 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm">
                          {item.title}
                          <ItemStateBadges item={item} />
                        </p>
                        <p className="text-muted-foreground text-xs tabular-nums">
                          {formatMoney(item.unitPriceMinor, item.currency)} / {item.unit} ·{" "}
                          {Math.round(item.vatRate * 100)}% VAT
                          {item.quantitySource === "manual" ? " · manual quantity" : null}
                        </p>
                        {item.note ? (
                          <p className="text-muted-foreground text-xs italic">{item.note}</p>
                        ) : null}
                        {item.comment ? (
                          <p className="text-muted-foreground text-xs">Note: {item.comment}</p>
                        ) : null}
                      </div>

                      <QuantityInput
                        inquiryId={inquiryId}
                        itemId={item.id}
                        quantity={item.quantity}
                      />

                      <span
                        className={cn(
                          "w-24 text-right text-sm tabular-nums",
                          // Muted because it is not part of the committed total.
                          item.optional && "text-muted-foreground",
                        )}
                      >
                        {formatMoney(line?.exclVatMinor ?? 0, item.currency)}
                      </span>

                      <ItemOptions inquiryId={inquiryId} item={item} />

                      <RemoveItemButton
                        inquiryId={inquiryId}
                        itemId={item.id}
                        title={item.title}
                      />
                      </div>

                      {item.suggested ? (
                        <ItemSuggestionCard
                          inquiryId={inquiryId}
                          itemId={item.id}
                          suggestion={item.suggested}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {draft.requirements.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-muted-foreground text-xs">Requirements</h3>
          <ul className="flex flex-wrap gap-2">
            {draft.requirements.map((requirement) => (
              <li key={requirement.id}>
                <Badge
                  variant={requirement.status === "matched" ? "secondary" : "outline"}
                  className={cn(
                    requirement.status === "matched"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : "text-destructive border-destructive/40",
                  )}
                >
                  {requirement.text}
                  <span className="ml-1 opacity-70">
                    {requirement.status === "matched" ? "matched" : "unmatched"}
                  </span>
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {draft.flags.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-muted-foreground text-xs">Warnings</h3>
          <ul className="space-y-1">
            {draft.flags.map((flag) => (
              <li
                key={flag.id}
                className="flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs"
              >
                {flag.severity === "warning" ? (
                  <AlertTriangle className="text-destructive mt-0.5 size-3.5 shrink-0" aria-hidden />
                ) : (
                  <Info className="text-muted-foreground mt-0.5 size-3.5 shrink-0" aria-hidden />
                )}
                <span className="flex-1">{flag.message}</span>
                <DismissFlagButton inquiryId={inquiryId} flagId={flag.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-1 border-t pt-3 text-sm tabular-nums">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Excl. VAT</span>
          <span>{formatMoney(totals.exclVatMinor, totals.currency)}</span>
        </div>
        {totals.vatByRate.map((bucket) => (
          <div key={bucket.rate} className="flex justify-between">
            <span className="text-muted-foreground">VAT {Math.round(bucket.rate * 100)}%</span>
            <span>{formatMoney(bucket.vatMinor, totals.currency)}</span>
          </div>
        ))}
        <div className="flex justify-between font-medium">
          <span>{totals.hasFlexibleValue ? "Committed incl. VAT" : "Incl. VAT"}</span>
          <span>{formatMoney(totals.inclVatMinor, totals.currency)}</span>
        </div>

        {/*
          With optional or flexible lines there is no single price: the
          committed figure is what the customer is certain to pay, the maximum
          is the ceiling if they take everything at its upper bound.
        */}
        {totals.hasFlexibleValue ? (
          <div className="text-muted-foreground flex justify-between border-t pt-1">
            <span>If all options are taken</span>
            <span>{formatMoney(totals.maximum.inclVatMinor, totals.currency)}</span>
          </div>
        ) : null}
      </section>

      <section className="space-y-2">
        <SubmitProposalButton inquiryId={inquiryId} label={label} disabled={!readiness.ready} />

        {!readiness.ready ? (
          <ul className="text-muted-foreground space-y-0.5 text-xs">
            {readiness.reasons.map((reason) => (
              <li key={reason}>· {reason}</li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
