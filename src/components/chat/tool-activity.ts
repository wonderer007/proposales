import type { UIMessage } from "ai";

/**
 * Turns a tool call into one short line for the chat, e.g.
 * "Added Lunch buffet × 50". The full arguments stay out of the transcript —
 * the manager sees the result on the Proposal Builder card.
 */

type ToolPart = {
  type: string;
  state?: string;
  input?: Record<string, unknown>;
  output?: unknown;
};

function draftItems(output: unknown): { id: string; title: string; quantity: number }[] {
  const items = (output as { items?: unknown })?.items;

  return Array.isArray(items) ? (items as { id: string; title: string; quantity: number }[]) : [];
}

export function describeToolCall(part: ToolPart): string | null {
  const name = part.type.startsWith("tool-") ? part.type.slice("tool-".length) : null;
  if (!name) return null;

  const input = part.input ?? {};

  switch (name) {
    case "listContentLibrary":
      return input.type ? `Looked up ${String(input.type)} products` : "Looked up the content library";

    case "getWorkingDraft":
      return "Checked the draft";

    case "upsertEvent": {
      const label = (input.label as string) ?? (input.type as string) ?? "event";
      const headcount = input.headcount ? ` · ${String(input.headcount)} guests` : "";
      return `${input.id ? "Updated" : "Added"} event: ${label}${headcount}`;
    }

    case "removeEvent":
      return "Removed an event";

    case "addItem": {
      const error = (part.output as { error?: string } | undefined)?.error;
      if (error) return "Tried to add a product that is not in the library";

      // The tool returns the whole draft; the new line is the last item.
      const added = draftItems(part.output).at(-1);
      return added ? `Added ${added.title} × ${added.quantity}` : "Added a product";
    }

    case "removeItem":
      return "Removed a product";

    case "setRequirements": {
      const list = (input.requirements as { text: string }[] | undefined) ?? [];
      return `Recorded ${list.length} requirement${list.length === 1 ? "" : "s"}`;
    }

    case "addFlag":
      return "Raised a warning";

    case "clearFlag":
      return "Cleared a warning";

    case "setBudget":
      return "Noted the budget";

    default:
      return name;
  }
}

/** Every tool line in one assistant message, in order. */
export function toolActivity(message: UIMessage): string[] {
  return message.parts
    .flatMap((part) => {
      const candidate = part as ToolPart;
      if (!candidate.type?.startsWith("tool-")) return [];
      // Only describe calls that finished, so lines do not flicker mid-stream.
      if (candidate.state && !candidate.state.includes("output")) return [];

      const line = describeToolCall(candidate);
      return line ? [line] : [];
    });
}
