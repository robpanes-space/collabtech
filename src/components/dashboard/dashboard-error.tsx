"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, RefreshCw } from "lucide-react";

/**
 * Professional project-data error. Shows only the client-safe message from the backend —
 * never stack traces, credentials or raw Jira responses.
 */
export function DashboardError({
  message,
  onRetry,
  reference,
}: {
  message?: string;
  onRetry?: () => void;
  /** Opaque error digest shown for support (matches server logs). */
  reference?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div role="alert" className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-10 text-center">
      <CloudOff aria-hidden className="size-8 text-muted-foreground" />
      <h1 className="text-lg font-semibold">Project data is temporarily unavailable</h1>
      <p className="text-sm text-muted-foreground">
        Unable to refresh Jira project data.{message ? ` ${message}` : ""}
      </p>
      {reference ? <p className="text-xs text-muted-foreground">Reference: {reference}</p> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => (onRetry ? onRetry() : router.refresh()))}
        className="mt-2 inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
      >
        <RefreshCw aria-hidden className={pending ? "size-4 animate-spin" : "size-4"} />
        {pending ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}
