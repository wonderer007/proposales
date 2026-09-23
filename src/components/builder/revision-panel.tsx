import { AlertTriangle, ArrowRight, UserCheck } from "lucide-react";

import { VersionNoteField } from "@/components/builder/version-note-field";
import { formatMoney } from "@/lib/builder/totals";
import type { PriceChange } from "@/lib/builder/price-check";

/**
 * What has changed since the version the customer received: their own
 * selections, the diff against the sent snapshot, and any library price that
 * moved underneath us (D14).
 */
export function RevisionPanel({
  inquiryId,
  version,
  changes,
  selections,
  priceChanges,
  totalDeltaMinor,
  currency,
  versionNote,
}: {
  inquiryId: string;
  version: number;
  changes: string[];
  selections: string[];
  priceChanges: PriceChange[];
  totalDeltaMinor: number;
  currency: string;
  versionNote: string | null;
}) {
  const nothingToShow =
    changes.length === 0 && selections.length === 0 && priceChanges.length === 0;

  if (nothingToShow) return null;

  return (
    <section className="space-y-3 rounded-lg border p-3">
      <h3 className="text-sm font-medium">Since version {version}</h3>

      {selections.length > 0 ? (
        <div className="space-y-1">
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <UserCheck className="size-3" aria-hidden /> What the customer did
          </p>
          <ul className="space-y-0.5 text-xs">
            {selections.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {priceChanges.length > 0 ? (
        <div className="space-y-1">
          <p className="text-destructive flex items-center gap-1.5 text-xs">
            <AlertTriangle className="size-3" aria-hidden /> Library prices have changed
          </p>
          <ul className="space-y-0.5 text-xs">
            {priceChanges.map((change) => (
              <li key={change.itemId} className="tabular-nums">
                · {change.title}: {formatMoney(change.wasMinor, change.currency)} →{" "}
                {formatMoney(change.nowMinor, change.currency)}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            The draft still quotes the old price. Remove and re-add the item to take the new one.
          </p>
        </div>
      ) : null}

      {changes.length > 0 ? (
        <div className="space-y-1">
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <ArrowRight className="size-3" aria-hidden /> Your changes
          </p>
          <ul className="space-y-0.5 text-xs">
            {changes.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
          {totalDeltaMinor !== 0 ? (
            <p className="text-xs tabular-nums">
              Total {totalDeltaMinor > 0 ? "up" : "down"} by{" "}
              {formatMoney(Math.abs(totalDeltaMinor), currency)}
            </p>
          ) : null}
        </div>
      ) : null}

      {changes.length > 0 ? (
        <VersionNoteField inquiryId={inquiryId} versionNote={versionNote} />
      ) : null}
    </section>
  );
}
