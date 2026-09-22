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
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8" noValidate>
      <section className="space-y-4">
        <h2 className="text-sm font-medium">Contact</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="contactName">
              Contact name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="contactName"
              {...form.register("contactName")}
              aria-invalid={!!errors.contactName}
            />
            <FieldError message={errors.contactName?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              {...form.register("email")}
              aria-invalid={!!errors.email}
            />
            <FieldError message={errors.email?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" type="tel" {...form.register("phone")} />
            <FieldError message={errors.phone?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyName">Company</Label>
            <Input id="companyName" {...form.register("companyName")} />
            <FieldError message={errors.companyName?.message} />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium">When</h2>

        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-64 flex-1 space-y-2">
            <Label>
              Dates <span className="text-destructive">*</span>
            </Label>
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

          <div className="w-32 space-y-2">
            <Label htmlFor="startTime">
              Start <span className="text-destructive">*</span>
            </Label>
            <Input
              id="startTime"
              type="time"
              {...form.register("range.startTime")}
              aria-invalid={!!errors.range?.startTime}
            />
            <FieldError message={errors.range?.startTime?.message} />
          </div>

          <div className="w-32 space-y-2">
            <Label htmlFor="endTime">
              End <span className="text-destructive">*</span>
            </Label>
            <Input
              id="endTime"
              type="time"
              {...form.register("range.endTime")}
              aria-invalid={!!errors.range?.endTime}
            />
            <FieldError message={errors.range?.endTime?.message} />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <Label htmlFor="message">
          Message <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="message"
          rows={6}
          placeholder="What is the customer asking for?"
          {...form.register("message")}
          aria-invalid={!!errors.message}
        />
        <FieldError message={errors.message?.message} />
      </section>

      {formError ? (
        <p className="text-destructive text-sm" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Create inquiry"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/")} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
