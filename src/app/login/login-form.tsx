"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, isPending] = useActionState(signIn, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="next" value={next} />

      <div className="space-y-1.5">
        <Label htmlFor="passcode">Code</Label>
        <Input
          id="passcode"
          name="passcode"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          aria-invalid={Boolean(state?.error)}
          aria-describedby={state?.error ? "passcode-error" : undefined}
        />
      </div>

      {state?.error ? (
        <p id="passcode-error" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}
