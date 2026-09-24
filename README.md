# Proposales Plus

Live: **https://proposales.vercel.app/**

Two tools for a hotel's event manager, on top of the [Proposales](https://docs.proposales.com) API.

- **Inquiry Manager**: an inquiry comes in, an AI assistant shortlists products from the content library, and the manager creates or versions the proposal from a builder.
- **Outreach** — past customers whose event is due round again, with their history and a drafted message. Behind a feature flag. No proposals are created here.

Built with Next.js (App Router), TypeScript, Neon Postgres + Drizzle, the Vercel AI SDK, Zod and shadcn/ui. Bun is the package manager and script runner — not npm, yarn or pnpm.

## Setup

```bash
bun install
cp .env.example .env.local   # fill in DATABASE_URL, PROPOSALES_API_KEY, AI_GATEWAY_API_KEY
bun run db:migrate
bun run db:seed              # sample inquiries
bun run content:seed         # products into the Proposales content library
bun run dev
```

`.env.example` documents every variable. The Proposales API key is server-side only.

## Commands

| | |
|---|---|
| `bun run dev` | dev server |
| `bun run build` | production build |
| `bun run typecheck` / `lint` / `bun test` | type check, lint, unit tests |
| `bun run db:generate` / `db:migrate` | Drizzle migrations |
| `bun run db:seed` / `content:seed` / `outreach:seed` | sample data |
| `bun run templates:sync` | mirror Proposales proposal templates locally |
| `bun run eval` | run the agent evals against the live library |

## Status

Built as an assignment. The live site is behind a shared code:

```
246810
```

That is the whole of the access control. There are **no accounts and no per-user data** — everyone who has the code sees the same inquiries and can act on all of them, including creating proposals in the connected Proposales workspace. Treat it as a shared demo, not a private one, and do not put real customer data in it.

Set `DEMO_PASSCODE` to enable the gate. With it unset there is no login screen, which is what you want locally.

`/api/chat` is capped at 20 requests a minute per IP, so an unattended client cannot run up the AI Gateway bill. Pair it with a spend cap in the Gateway dashboard — the cap is per instance (see Known gaps), so it is a budget guard, not a hard limit.

## Prompt injection

The customer's message comes from a public form and goes into the assistant's system prompt, so treat it as hostile input. It is delimited, but delimiters are not a security boundary — the defence is that a successful injection has nothing worth reaching:

- The agent has **no tool that creates, patches or versions a proposal**. Only the manager's button does, through a server action.
- It cannot set `dateConfirmed`. Only the manager's checkbox can.
- It can only reference products that exist in the content library; the server rejects unknown ids.
- It cannot apply discounts, override pricing policy, pre-select optional lines for the customer, or create templates.
- Quantities, totals and VAT are computed in code, never by the model.
- Every tool is scoped to one inquiry by closure — the inquiry id comes from the route, never from the model, so one inquiry's message cannot reach another's draft.

The worst a successful injection achieves is a misleading draft on the builder card, which the manager reads before clicking anything. `src/lib/agent/tools.test.ts` asserts these limits against the tool set so they cannot be widened by accident.

## Known gaps

- **The double-submit guard is not a guarantee on serverless.** `withDraftLock` is a module-level `Map`, so it only serialises within one instance; two concurrent requests on Vercel can land on different ones. A partial unique index means the second DB insert still fails, but only after its `POST /v3/proposals` succeeded — leaving an orphan draft in Proposales.
- **Same orphan risk without concurrency.** The create and version paths call the Proposales API first and write to Postgres second, so a DB failure after a successful API call leaves a proposal we have no record of.

- **The rate limit and the passcode are per-instance and unsigned respectively.** `createRateLimiter` counts in a module-level Map, so the real ceiling is `20 × instances`; the passcode cookie holds the code itself rather than a signed session. Both are demo-grade on purpose.

Both of the orphan risks need the write to be idempotent — an inquiry-scoped key sent to Proposales, or a reservation row taken before the API call.

## Notes

- Money is stored in minor units; quantities, totals and VAT are computed in code, never by the model.
- Pricing lives in a local `content_catalog` table — the Proposales content API has no price field.
- `bun run build` needs an arm64 Node on Apple Silicon; an x86_64 Node under Rosetta fails to load Tailwind's native binding.
