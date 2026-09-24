"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { PASSCODE_COOKIE, demoPasscode } from "@/lib/auth";

/** A relative path only — never an absolute URL an attacker supplied. */
function safeNext(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}

export async function signIn(_: { error: string } | null, formData: FormData) {
  const passcode = demoPasscode();
  const next = safeNext(formData.get("next"));

  // No gate configured: nothing to sign in to.
  if (!passcode) redirect(next);

  if (formData.get("passcode") !== passcode) {
    return { error: "That code is not right." };
  }

  const store = await cookies();
  store.set(PASSCODE_COOKIE, passcode, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect(next);
}
