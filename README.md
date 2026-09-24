# Proposales Plus

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
| `bun run typecheck` / `lint` / `bun test` | the checks CI would run |
| `bun run db:generate` / `db:migrate` | Drizzle migrations |
| `bun run db:seed` / `content:seed` / `outreach:seed` | sample data |
| `bun run templates:sync` | mirror Proposales proposal templates locally |
| `bun run eval` | run the agent evals against the live library |

## Notes

- Money is stored in minor units; quantities, totals and VAT are computed in code, never by the model.
- Pricing lives in a local `content_catalog` table — the Proposales content API has no price field.
- `bun run build` needs an arm64 Node on Apple Silicon; an x86_64 Node under Rosetta fails to load Tailwind's native binding.
