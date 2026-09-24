/**
 * The demo's front door.
 *
 * One shared passcode, kept deliberately crude: this exists to keep the open
 * demo off search engines and out of reach of a passer-by, not to protect
 * anything. There are no accounts, no sessions and no per-user anything — see
 * the README.
 *
 * Read through `process.env` rather than the Zod-validated `env`, because the
 * proxy runs before the app and must not pull the whole schema in.
 */

export const PASSCODE_COOKIE = "demo_passcode";

/** The configured passcode, or null when the gate is switched off. */
export function demoPasscode(): string | null {
  const value = process.env.DEMO_PASSCODE?.trim();
  return value ? value : null;
}

/** Whether a cookie value gets past the gate. */
export function isAuthorised(cookieValue: string | undefined): boolean {
  const passcode = demoPasscode();
  if (!passcode) return true;

  return cookieValue === passcode;
}
