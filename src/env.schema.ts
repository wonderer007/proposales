import { z } from "zod";

/**
 * Shape of the server environment. Kept in its own module (values-free) so it
 * can be unit tested without pulling in `server-only`.
 */
/**
 * An on/off switch supplied as a string by the shell, Vercel and `.env`.
 * Generous about what counts as on, strict about everything else being off.
 */
const flag = z
  .string()
  .transform((value) => ["1", "true", "yes", "on"].includes(value.trim().toLowerCase()))
  .or(z.boolean());

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Neon Postgres connection string. */
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  /** Proposales API key — server-side use only, never exposed to the client. */
  PROPOSALES_API_KEY: z.string().min(1, "PROPOSALES_API_KEY is required"),
  /**
   * Optional default company. Companies are read from the API and chosen in
   * the app; this only picks the starting one when no choice has been made.
   */
  PROPOSALES_COMPANY_ID: z.string().optional(),
  PROPOSALES_API_BASE_URL: z.url().default("https://api.proposales.com"),

  /** Vercel AI Gateway credentials. */
  AI_GATEWAY_API_KEY: z.string().min(1, "AI_GATEWAY_API_KEY is required"),
  /** Gateway model id, e.g. "anthropic/claude-sonnet-5". */
  AI_MODEL: z.string().min(1).default("anthropic/claude-sonnet-5"),

  /**
   * Whether the outreach radar (D17) is switched on.
   *
   * Off unless explicitly enabled, so a deploy that says nothing about it does
   * not expose the feature. Read through `isOutreachEnabled` in `src/lib/flags.ts`,
   * which guards the screens and the server actions alike.
   */
  OUTREACH_ENABLED: flag.default(false),

  /**
   * Shared passcode for the demo. When unset the gate is off, so local
   * development needs no login; set it on any deployment that is reachable.
   */
  DEMO_PASSCODE: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates a raw environment record. Throws with every problem listed, one
 * per line, so a misconfigured deploy fails fast and readably.
 */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${details}`);
  }

  return result.data;
}

/**
 * Reads and validates `process.env`. Used by `src/env.ts` for the app and
 * directly by Bun scripts, which run outside the React server condition and so
 * cannot import the `server-only`-guarded module.
 */
export function loadEnv(): Env {
  return parseEnv(process.env as Record<string, string | undefined>);
}
