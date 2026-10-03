"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/lib/auth/actions";

const INITIAL: LoginState = { error: null, email: "" };

/** Email + password sign-in. With Atlassian enabled it is the secondary (fallback/admin) option. */
export function LoginForm({ next, secondary = false }: { next: string; secondary?: boolean }) {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL);
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate aria-label="Sign in with email and password">
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-status-critical-text">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className={
          secondary
            ? "h-10 rounded-md border border-border bg-background text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
            : "h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
        }
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
