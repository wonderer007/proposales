import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { loadEnv } from "@/env.schema";
import * as schema from "./schema";

/**
 * Drizzle client over Neon's HTTP driver.
 *
 * Deliberately not guarded by `server-only`: the Bun scripts in `scripts/`
 * import it too, and they run outside the React server condition. Nothing in
 * `src/components` may import this module.
 *
 * Note: the HTTP driver has no interactive transactions. `db.transaction()`
 * sends its statements as one atomic request but cannot branch on intermediate
 * results, which is enough for the supersede-and-insert in D11.
 */
const { DATABASE_URL } = loadEnv();

export const db = drizzle(neon(DATABASE_URL), { schema });

export type Db = typeof db;
export { schema };
