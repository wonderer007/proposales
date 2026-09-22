import type { CreateRfpRequest } from "@/lib/proposales/schemas";
import type { Inquiry, InquiryEvent } from "@/lib/db/schema";

/** Splits a free-text contact name into the API's first/last name fields. */
export function splitName(contactName: string): { first_name: string; last_name?: string } {
  const parts = contactName.trim().split(/\s+/).filter(Boolean);

  if (parts.length <= 1) return { first_name: parts[0] ?? contactName.trim() };

  return { first_name: parts.slice(0, -1).join(" "), last_name: parts.at(-1) };
}

/**
 * Combines a `YYYY-MM-DD` date and an `HH:mm[:ss]` time into an ISO 8601
 * instant. The stored values carry no zone, so they are read as UTC — the RFP
 * only records them for display alongside the request.
 */
export function toIsoInstant(date: string, time: string): string | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})/.exec(time);
  if (!dateMatch || !timeMatch) return null;

  const [, year, month, day] = dateMatch;
  const [, hour, minute] = timeMatch;

  return new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)),
  ).toISOString();
}

/**
 * Maps a stored inquiry onto the Create RFP body.
 *
 * `silent_confirmation` is always set: the contact addresses here are demo
 * data, and an inquiry entered by a manager on someone's behalf should not
 * trigger an automated email to that person.
 */
export function toRfpRequest(
  inquiry: Pick<Inquiry, "contactName" | "email" | "phone" | "companyName" | "message" | "language">,
  events: Pick<InquiryEvent, "date" | "endDate" | "startTime" | "endTime" | "position">[],
): CreateRfpRequest {
  const ordered = [...events].sort(
    (a, b) => a.date.localeCompare(b.date) || a.position - b.position,
  );
  const first = ordered.at(0);
  const last = ordered.at(-1);

  const body: CreateRfpRequest = {
    email: inquiry.email,
    ...splitName(inquiry.contactName),
    message: inquiry.message,
    language: inquiry.language,
    silent_confirmation: "1",
  };

  if (inquiry.phone) body.phone_number = inquiry.phone;
  if (inquiry.companyName) body.company_name = inquiry.companyName;

  const start = first ? toIsoInstant(first.date, first.startTime) : null;
  // A range that spans days ends on its end_date, not on its start day.
  const end = last ? toIsoInstant(last.endDate ?? last.date, last.endTime) : null;
  if (start) body.start_date = start;
  if (end) body.end_date = end;

  return body;
}
