import { loadEnv } from "@/env.schema";

/**
 * Feature flags.
 *
 * Read from the server environment only, so a disabled feature is absent from
 * the client bundle as well as from the UI. Every flagged feature must be
 * guarded in three places — the route, the way in to it, and any server action
 * behind it — because hiding a link does not close a route.
 */

const env = loadEnv();

export function isOutreachEnabled(): boolean {
  return env.OUTREACH_ENABLED;
}
