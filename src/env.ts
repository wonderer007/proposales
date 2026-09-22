import "server-only";

import { loadEnv, type Env } from "@/env.schema";

/**
 * Validated server environment. Importing this module from a Client Component
 * is a build error, so API keys can never reach the browser bundle.
 */
export const env: Env = loadEnv();
