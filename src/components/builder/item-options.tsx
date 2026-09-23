"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { updateItemOptions } from "@/lib/builder/actions";
import type { DraftItem } from "@/lib/builder/draft";

/**
 * Per-item presentation settings: what the recipient may deselect, adjust, or
 * read as a note. These never change the price — only what the customer can
 * do with the line.
 */
export function ItemOptions({ inquiryId, item }: { inquiryId: string; item: DraftItem }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Local copies so min/max can be typed freely before committing.
  const [min, setMin] = useState(item.quantityMin?.toString() ?? "");
  const [max, setMax] = useState(item.quantityMax?.toString() ?? "");
  const [comment, setComment] = useState(item.comment ?? "");
  const [choice, setChoice] = useState(item.choiceGroup ?? "");

  function save(options: Parameters<typeof updateItemOptions>[2]) {
    startTransition(async () => {
      const result = await updateItemOptions(inquiryId, item.id, options);
      if (!result.ok) toast.error(result.error);
    });
  }

  function commitBounds() {
    save({
      quantityMin: min.trim() === "" ? null : Number(min),
      quantityMax: max.trim() === "" ? null : Number(max),
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={`Options for ${item.title}`}
        >
          <SlidersHorizontal className="size-3.5" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 space-y-4">
        <div className="space-y-2">
          <Label className="text-xs">Role</Label>
          <div className="flex gap-2">
            {(["core", "addon"] as const).map((role) => (
              <Button
                key={role}
                type="button"
                size="sm"
                variant={item.role === role ? "default" : "outline"}
                disabled={isPending}
                onClick={() => save({ role })}
                className="flex-1"
              >
                {role === "core" ? "Core" : "Add-on"}
              </Button>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            Add-ons are extras the customer can decline.
          </p>
        </div>

        <div className="flex items-start gap-2">
          <Checkbox
            id={`optional-${item.id}`}
            checked={item.optional}
            disabled={isPending}
            onCheckedChange={(checked) => save({ optional: checked === true })}
          />
          <div className="space-y-0.5">
            <Label htmlFor={`optional-${item.id}`} className="text-xs font-normal">
              Optional
            </Label>
            <p className="text-muted-foreground text-xs">The customer can deselect this line.</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <Checkbox
              id={`flexible-${item.id}`}
              checked={item.quantityEditable}
              disabled={isPending}
              onCheckedChange={(checked) => save({ quantityEditable: checked === true })}
            />
            <div className="space-y-0.5">
              <Label htmlFor={`flexible-${item.id}`} className="text-xs font-normal">
                Flexible quantity
              </Label>
              <p className="text-muted-foreground text-xs">
                The customer can change the number, within the range below.
              </p>
            </div>
          </div>

          {item.quantityEditable ? (
            <div className="flex items-end gap-2 pl-6">
              <div className="space-y-1">
                <Label htmlFor={`min-${item.id}`} className="text-xs">
                  Min
                </Label>
                <Input
                  id={`min-${item.id}`}
                  type="number"
                  min={0}
                  value={min}
                  disabled={isPending}
                  onChange={(event) => setMin(event.target.value)}
                  onBlur={commitBounds}
                  className="h-8 w-20 tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`max-${item.id}`} className="text-xs">
                  Max
                </Label>
                <Input
                  id={`max-${item.id}`}
                  type="number"
                  min={0}
                  value={max}
                  disabled={isPending}
                  onChange={(event) => setMax(event.target.value)}
                  onBlur={commitBounds}
                  className="h-8 w-20 tabular-nums"
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor={`choice-${item.id}`} className="text-xs">
            Customer chooses between
          </Label>
          <Input
            id={`choice-${item.id}`}
            value={choice}
            disabled={isPending}
            placeholder="e.g. the meeting room"
            onChange={(event) => setChoice(event.target.value)}
            onBlur={() => save({ choiceGroup: choice.trim() || null })}
            className="h-8 text-xs"
          />
          <p className="text-muted-foreground text-xs">
            Give two or more lines the same name to offer them as alternatives.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor={`comment-${item.id}`} className="text-xs">
            Note to the customer
          </Label>
          <Textarea
            id={`comment-${item.id}`}
            rows={2}
            value={comment}
            disabled={isPending}
            placeholder="Shown beside this line in the proposal"
            onChange={(event) => setComment(event.target.value)}
            onBlur={() => save({ comment })}
            className="resize-none text-xs"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
