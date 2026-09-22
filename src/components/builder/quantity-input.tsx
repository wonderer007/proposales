"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { updateItemQuantity } from "@/lib/builder/actions";

/**
 * Editable quantity. Commits on blur or Enter; a manager-set value becomes
 * `manual` and stops being recomputed from the headcount.
 */
export function QuantityInput({
  inquiryId,
  itemId,
  quantity,
}: {
  inquiryId: string;
  itemId: string;
  quantity: number;
}) {
  const [value, setValue] = useState(String(quantity));
  const [isPending, startTransition] = useTransition();

  // Keep in step when the server sends back a recomputed quantity.
  const [lastQuantity, setLastQuantity] = useState(quantity);
  if (quantity !== lastQuantity) {
    setLastQuantity(quantity);
    setValue(String(quantity));
  }

  function commit() {
    const next = Number(value);

    if (!Number.isFinite(next) || next < 0) {
      setValue(String(quantity));
      toast.error("Quantity must be zero or more");
      return;
    }

    if (next === quantity) return;

    startTransition(async () => {
      const result = await updateItemQuantity(inquiryId, itemId, next);
      if (!result.ok) {
        setValue(String(quantity));
        toast.error(result.error);
      }
    });
  }

  return (
    <Input
      type="number"
      min={0}
      step="0.5"
      inputMode="decimal"
      value={value}
      disabled={isPending}
      aria-label="Quantity"
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className="h-8 w-20 tabular-nums"
    />
  );
}
