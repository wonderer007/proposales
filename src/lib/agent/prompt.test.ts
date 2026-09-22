import { describe, expect, test } from "bun:test";

import { emptyDraft, upsertEvent } from "@/lib/builder/draft";
import type { InquiryWithEvents } from "@/lib/db/queries";
import { buildSystemPrompt } from "./prompt";

const inquiry = {
  id: "inq-1",
  contactName: "Marcus Hale",
  email: "marcus@brightloop.com",
  phone: "+44 20 7946 0102",
  companyName: "Brightloop Ltd",
  message: "Company meeting with lunch, 50 guests.",
  language: "en",
  rfpId: 1,
  rfpSyncError: null,
  workingDraft: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  events: [
    {
      id: "e1",
      inquiryId: "inq-1",
      date: "2026-11-05",
      endDate: null,
      startTime: "09:00:00",
      endTime: "13:00:00",
      position: 0,
    },
  ],
} as unknown as InquiryWithEvents;

describe("buildSystemPrompt", () => {
  test("includes today, the contact and the message", () => {
    const prompt = buildSystemPrompt({ inquiry, draft: emptyDraft(), today: "2026-09-22" });

    expect(prompt).toContain("Tuesday, 22 September 2026");
    expect(prompt).toContain("Marcus Hale (Brightloop Ltd)");
    expect(prompt).toContain("Company meeting with lunch, 50 guests.");
  });

  test("lists the form dates with weekday and trimmed times", () => {
    const prompt = buildSystemPrompt({ inquiry, draft: emptyDraft(), today: "2026-09-22" });

    expect(prompt).toContain("- Thursday, 5 November 2026, 09:00–13:00");
  });

  test("says the draft is empty when it is", () => {
    const prompt = buildSystemPrompt({ inquiry, draft: emptyDraft(), today: "2026-09-22" });

    expect(prompt).toContain("The working draft is empty.");
  });

  test("serialises a populated draft", () => {
    const draft = upsertEvent(emptyDraft(), {
      id: "evt-1",
      type: "meeting",
      label: "Company meeting",
      date: "2026-11-05",
      startTime: "09:00",
      endTime: "12:00",
      headcount: 50,
      inferred: [],
    });

    const prompt = buildSystemPrompt({ inquiry, draft, today: "2026-09-22" });

    expect(prompt).toContain("Company meeting");
    expect(prompt).not.toContain("The working draft is empty.");
  });

  test("forbids claiming a proposal was created", () => {
    const prompt = buildSystemPrompt({ inquiry, draft: emptyDraft(), today: "2026-09-22" });

    expect(prompt).toContain("Never claim a proposal was created");
    expect(prompt).toContain("Only the manager can");
  });

  test("switches language for a Swedish inquiry", () => {
    const prompt = buildSystemPrompt({
      inquiry: { ...inquiry, language: "sv" } as InquiryWithEvents,
      draft: emptyDraft("sv"),
      today: "2026-09-22",
    });

    expect(prompt).toContain("Language: Swedish");
    expect(prompt).toContain("Reply in the manager's language: Swedish");
  });
});
