# CLAUDE.md

## Project

**Inquiry-to-Proposal Agent** — a web app for hotel managers. Inquiries (RFPs) are entered through a form and stored in Postgres. On each inquiry page, the manager chats with an AI assistant that helps shortlist products from the hotel's Proposales content library. A separate **Proposal Builder** card shows the shortlist; only the manager, by clicking a button on that card, can create, update, or version a proposal in Proposales.

Full product spec: `docs/SPEC.md`
Work plan: `docs/DELIVERABLES.md`

## Tech stack

- Next.js (App Router) + TypeScript (strict)
- Bun as package manager and script runner (never npm, yarn, or pnpm)
- Neon Postgres via `@neondatabase/serverless` + Drizzle ORM / drizzle-kit
- Vercel AI SDK (`ai`, `@ai-sdk/react`, and a provider package or Vercel AI Gateway) — use the latest stable version and consult its current docs rather than memory
- Zod for all validation (env, forms, API responses, AI tool inputs)
- shadcn/ui + Tailwind for UI
- Deployed on Vercel (Hobby)

## Commands

```bash
bun install
bun run dev
bun run build
bun run lint
bun run typecheck      # tsc --noEmit
bun test               # Bun's built-in test runner
bunx drizzle-kit generate
bunx drizzle-kit migrate
bunx shadcn@latest add <component>
```

## Working rules (non-negotiable)

### Git
- **Never** run `git add`, `git commit`, `git push`, `git reset`, `git rebase`, `git stash`, `git checkout`, `git merge`, or any command that changes git state or history.
- Read-only git commands (`git status`, `git diff`, `git log`) are allowed.
- A human reviews and commits every deliverable. You only **suggest** a commit message.

### One deliverable at a time
- Work only on the deliverable you were asked to implement (e.g. "Implement D4").
- Do not start the next deliverable, and do not make unrelated refactors.
- If a deliverable is ambiguous or blocked, stop and ask instead of guessing.
- Plan each deliverable, one deliverable will have multiple human reivew rounds (ask for review for small changes rather shipping complete deliverable)
- if possible plan each deliverable before starting

### End-of-deliverable report
When you finish a deliverable, stop and reply with:

1. **Summary** — what was built, in 2–4 sentences.
2. **Files changed** — list of created/modified/deleted files.
3. **How to verify** — exact commands and manual steps for the reviewer.
4. **Decisions & assumptions** — anything you chose that the reviewer should know, including any API behavior you could not verify.
5. **Suggested commit message** — Conventional Commits format, e.g.
   ```
   feat(inquiries): add inquiry list with server-side search

   - shadcn data table with name, email, event date, status
   - debounced search by name/email (case-insensitive)
   ```

Before reporting, make sure `bun run typecheck`, `bun run lint`, and `bun test` pass.

### Secrets & security
- No secrets in code. All config through env vars, validated with Zod in `src/env.ts`. Keep `.env.example` up to date.
- The Proposales API key is used **server-side only** (server actions, route handlers, scripts). Never expose it to the client.
- AI tools receive the inquiry ID from the server route context, never from model-supplied arguments.

### Proposales API
- Base URL: `https://api.proposales.com`, auth header `Authorization: Bearer <PROPOSALES_API_KEY>`, JSON bodies.
- Source of truth: https://docs.proposales.com/openapi.json and https://docs.proposales.com/llms.txt. **Do not invent endpoints or fields.** If a field is not in the spec, stop and ask.
- Validate every response with Zod, reading only the fields we need.
- In proposal blocks, `content_id` must be the product's **variation_id** (each product has exactly one variation).

### AI agent (non-negotiable)
- The agent has **no tool that creates, patches, or versions proposals**. Only the Proposal Builder button (a server action) can call those endpoints.
- The agent may only reference products that exist in the content library; the server rejects unknown IDs.
- The agent can never set `dateConfirmed = true`. Only the manager can, via the checkbox on the card.
- Quantities, totals, and VAT are computed in code, never by the LLM.

## Code layout

```
src/
  app/
    page.tsx                     # inquiry list
    inquiries/new/page.tsx       # new inquiry form
    inquiries/[id]/page.tsx      # detail: history, chat, builder card
    api/chat/route.ts            # AI chat endpoint
  components/                    # UI components (shadcn in components/ui)
  env.ts                         # Zod-validated env
  lib/
    db/            schema.ts, client.ts, queries/
    proposales/    client.ts, schemas.ts
    builder/       draft.ts, quantity.ts, totals.ts, readiness.ts, diff.ts, to-proposal.ts
    agent/         prompt.ts, tools.ts
scripts/           whoami.ts, seed-content.ts, seed-db.ts, eval.ts
evals/fixtures/    test inquiries (JSON)
docs/              SPEC.md, DELIVERABLES.md
```

## Conventions
- Server Components by default; `"use client"` only where needed.
- Mutations through server actions; validate input with Zod on the server.
- Pure domain logic in `src/lib/builder` has no I/O and is unit tested.
- Dates stored as ISO `YYYY-MM-DD`, times as `HH:mm`, displayed with weekday (e.g. "Tuesday, 29 September 2026").
- Money as integers in minor units (öre/cents) where possible to avoid float errors.
