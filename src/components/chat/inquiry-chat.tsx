"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowUp, Check, Loader2, RefreshCw, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Markdown } from "@/components/chat/markdown";
import { toolActivity } from "@/components/chat/tool-activity";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";

/** The obvious first thing to ask, offered as a one-click starter. */
const OPENING_QUESTION = "What should we offer for this inquiry?";

function messageText(message: UIMessage): string {
  // A reply that pauses for tool calls arrives as several text parts. Joined
  // with nothing they run together mid-sentence, so separate them.
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { text: string }).text.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function InquiryChat({
  inquiryId,
  initialMessages,
}: {
  inquiryId: string;
  initialMessages: UIMessage[];
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error, regenerate, clearError, stop } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: "/api/chat", body: { inquiryId } }),
    onFinish: () => {
      // The assistant will edit the working draft once it has tools (D10), so
      // pull the builder card back in step after every turn.
      router.refresh();
    },
  });

  const isStreaming = status === "streaming" || status === "submitted";

  // Keep the manager informed for the whole turn: the agent may spend several
  // seconds calling tools before any text arrives, and silence reads as a hang.
  const lastMessage = messages.at(-1);
  const workingLabel = (() => {
    if (status === "submitted") return "Thinking…";
    if (!lastMessage || lastMessage.role !== "assistant") return "Thinking…";

    const running = toolActivity(lastMessage).find((line) => !line.done);
    if (running) return `${running.text}…`;

    return messageText(lastMessage) ? "Writing…" : "Thinking…";
  })();

  // Keep the newest message in view as it streams.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isStreaming]);

  function send(text: string) {
    if (!text || isStreaming) return;

    clearError();
    setInput("");
    void sendMessage({ text });
  }

  function submit() {
    send(input.trim());
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm">
            <p>Ask what the customer needs — or start with:</p>
            {/*
              One click to begin. The same text the manager would type, sent
              straight away rather than dropped into the box to be confirmed.
            */}
            <button
              type="button"
              disabled={isStreaming}
              onClick={() => send(OPENING_QUESTION)}
              className="text-foreground rounded-md border border-dashed px-3 py-1.5 underline-offset-4 hover:underline disabled:opacity-50"
            >
              “{OPENING_QUESTION}”
            </button>
          </div>
        ) : (
          messages.map((message) => {
            const activity = message.role === "assistant" ? toolActivity(message) : [];
            const text = messageText(message);

            return (
              <div
                key={message.id}
                className={cn(
                  "flex flex-col gap-1.5",
                  message.role === "user" ? "items-end" : "items-start",
                )}
              >
                {activity.length > 0 ? (
                  <ul className="text-muted-foreground space-y-0.5 text-xs">
                    {activity.map((line, index) => (
                      <li key={`${line.text}-${index}`} className="flex items-center gap-1.5">
                        {line.done ? (
                          <Check className="size-3 shrink-0" aria-hidden />
                        ) : (
                          <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />
                        )}
                        {line.text}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {text || activity.length === 0 ? (
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground whitespace-pre-wrap"
                        : "bg-muted",
                    )}
                  >
                    {text ? (
                      // The manager's own text is shown as typed; only the
                      // assistant writes markdown.
                      message.role === "assistant" ? <Markdown>{text}</Markdown> : text
                    ) : (
                      <span className="text-muted-foreground italic">…</span>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })
        )}

        {isStreaming ? (
          <div className="text-muted-foreground flex items-center gap-2 text-xs" aria-live="polite">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            {workingLabel}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="border-destructive/40 text-destructive flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs">
          <span className="flex-1">{error.message || "The assistant could not respond."}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void regenerate()}>
            <RefreshCw className="size-3" /> Retry
          </Button>
        </div>
      ) : null}

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Textarea
          value={input}
          rows={2}
          placeholder="Ask the assistant…"
          aria-label="Message the assistant"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter makes a new line.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          className="max-h-40 min-h-16 flex-1 resize-none"
        />

        {isStreaming ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Stop"
            onClick={() => void stop()}
          >
            <Square className="size-4" />
          </Button>
        ) : (
          <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Send">
            <ArrowUp className="size-4" />
          </Button>
        )}
      </form>
    </div>
  );
}
