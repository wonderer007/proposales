/**
 * Applies pending migrations from ./drizzle over Neon's HTTP driver.
 *
 *   bun run db:migrate
 *
 * `drizzle-kit migrate` is not used: it insists on a WebSocket connection that
 * fails in this environment, swallows the underlying error, and exits 1 even
 * when there is nothing to apply.
 */
import { migrate } from "drizzle-orm/neon-http/migrator";

import { db } from "@/lib/db/client";

try {
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("Migrations up to date.");
} catch (error) {
  console.error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
