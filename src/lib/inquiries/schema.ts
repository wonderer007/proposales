import { z } from "zod";

/**
 * Validation for the new-inquiry form, shared by the client form and the
 * server action so both reject exactly the same input.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const languageSchema = z.enum(["en", "sv"]);
export type Language = z.infer<typeof languageSchema>;

/**
 * The single date/time range on the form: a start day and an end day (the same
 * day for a one-day booking), with a start and end time.
 */
export const dateRangeInputSchema = z
  .object({
    startDate: z.string().regex(ISO_DATE, "Pick a date"),
    endDate: z.string().regex(ISO_DATE, "Pick a date"),
    startTime: z.string().regex(HH_MM, "Use HH:mm"),
    endTime: z.string().regex(HH_MM, "Use HH:mm"),
  })
  .refine((range) => range.endDate >= range.startDate, {
    message: "The end date cannot be before the start date",
    path: ["endDate"],
  })
  .refine(
    (range) => range.endDate > range.startDate || range.endTime > range.startTime,
    {
      message: "End time must be after the start time",
      path: ["endTime"],
    },
  );

export type DateRangeInput = z.infer<typeof dateRangeInputSchema>;

export const newInquirySchema = z.object({
  contactName: z.string().trim().min(1, "Contact name is required"),
  email: z.email("Enter a valid email address"),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  companyName: z.string().trim().max(200).optional().or(z.literal("")),
  message: z.string().trim().min(1, "Message is required"),
  range: dateRangeInputSchema,
});

export type NewInquiryInput = z.infer<typeof newInquirySchema>;

/** Starting values for the range picker. */
export function emptyRange(): DateRangeInput {
  return { startDate: "", endDate: "", startTime: "09:00", endTime: "17:00" };
}

const SWEDISH_MARKERS = [
  "hej",
  "vi ",
  "och ",
  "för ",
  "att ",
  "med ",
  "tack",
  "offert",
  "personer",
  "gärna",
  "kan ni",
  "bokning",
  "middag",
  "möte",
  "konferens",
  "frukost",
  "lunch för",
  "rum",
];

/**
 * Guesses the inquiry language from the message.
 *
 * Deliberately crude — it only has to pick a sensible default for the select
 * on the form, which the manager can change. Swedish-only characters are the
 * strongest signal; otherwise we count common Swedish words, and two or more
 * hits beats the English default.
 */
export function detectLanguage(message: string): Language {
  const text = message.toLowerCase();

  if (/[åä]/.test(text)) return "sv";

  // "ö" also appears in German and in names, so it needs corroboration.
  const markers = SWEDISH_MARKERS.filter((marker) => text.includes(marker)).length;
  const hasO = /ö/.test(text);

  if (markers >= 2 || (hasO && markers >= 1)) return "sv";

  return "en";
}
