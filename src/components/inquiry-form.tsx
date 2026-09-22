"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { DateRangeField } from "@/components/date-range-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createInquiry } from "@/lib/inquiries/actions";
import { emptyRange, newInquirySchema, type NewInquiryInput } from "@/lib/inquiries/schema";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-destructive text-xs">{message}</p>;
}

/** Most fields are required, so the two that aren't say so instead. */
function Optional() {
  return <span className="text-muted-foreground font-normal">Optional</span>;
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 sm:grid-cols-[11rem_1fr] sm:gap-8">
      <div className="space-y-1">
        <h2 className="text-base leading-snug font-semibold">{title}</h2>
        <p className="text-muted-foreground text-sm leading-normal">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function InquiryForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<NewInquiryInput>({
    resolver: zodResolver(newInquirySchema),
    defaultValues: {
      contactName: "",
      email: "",
      phone: "",
      companyName: "",
      message: "",
      range: emptyRange(),
    },
  });

  const range = useWatch({ control: form.control, name: "range" });

  function onSubmit(values: NewInquiryInput) {
    setFormError(null);

    startTransition(async () => {
      const result = await createInquiry(values);

      // A successful create redirects, so anything returned is a failure.
      if (result?.fieldErrors) {
        for (const [path, error] of Object.entries(result.fieldErrors)) {
          form.setError(path as keyof NewInquiryInput, { message: error });
        }
      }

      if (result) {
        setFormError(result.error);
        toast.error(result.error);
      }
    });
  }

  const errors = form.formState.errors;

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="divide-border space-y-8 *:not-first:pt-8 *:not-first:border-t"
      noValidate
    >
      <FormSection title="Contact" description="Who sent the request, and how to reach them.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="contactName">Contact name</Label>
            <Input
              id="contactName"
              autoComplete="name"
              {...form.register("contactName")}
              aria-invalid={!!errors.contactName}
            />
            <FieldError message={errors.contactName?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              {...form.register("email")}
              aria-invalid={!!errors.email}
            />
            <FieldError message={errors.email?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">
              Phone <Optional />
            </Label>
            <Input id="phone" type="tel" autoComplete="tel" {...form.register("phone")} />
            <FieldError message={errors.phone?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyName">
              Company <Optional />
            </Label>
            <Input id="companyName" autoComplete="organization" {...form.register("companyName")} />
            <FieldError message={errors.companyName?.message} />
          </div>
        </div>
      </FormSection>

      <FormSection title="When" description="The dates and hours the customer asked for.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Dates</Label>
            <DateRangeField
              startDate={range?.startDate ?? ""}
              endDate={range?.endDate ?? ""}
              invalid={!!errors.range?.startDate || !!errors.range?.endDate}
              onChange={(next) => {
                form.setValue("range.startDate", next.startDate, { shouldValidate: true });
                form.setValue("range.endDate", next.endDate, { shouldValidate: true });
              }}
            />
            <FieldError
              message={errors.range?.startDate?.message ?? errors.range?.endDate?.message}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="startTime">Start</Label>
            <Input
              id="startTime"
              type="time"
              className="tabular-nums"
              {...form.register("range.startTime")}
              aria-invalid={!!errors.range?.startTime}
            />
            <FieldError message={errors.range?.startTime?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="endTime">End</Label>
            <Input
              id="endTime"
              type="time"
              className="tabular-nums"
              {...form.register("range.endTime")}
              aria-invalid={!!errors.range?.endTime}
            />
            <FieldError message={errors.range?.endTime?.message} />
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Request"
        description="The customer's message, in their own words. The assistant reads this to build the shortlist."
      >
        <div className="space-y-2">
          <Label htmlFor="message">Message</Label>
          <Textarea
            id="message"
            // The primitive uses field-sizing: content, which ignores `rows`;
            // give the field a real starting height since it grows with input.
            className="min-h-36 leading-relaxed"
            placeholder="What is the customer asking for?"
            {...form.register("message")}
            aria-invalid={!!errors.message}
          />
          <FieldError message={errors.message?.message} />
        </div>
      </FormSection>

      <div className="space-y-4">
        {formError ? (
          <p className="text-destructive text-sm" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="flex gap-3 sm:pl-[calc(11rem+2rem)]">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Create inquiry"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.push("/")} disabled={isPending}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}
