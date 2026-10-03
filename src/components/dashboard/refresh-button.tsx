"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Re-renders the page on the server. The Jira payload is cached as one unit and read at most
 * once per `refreshIntervalSeconds`, so a click may legitimately return the same cached data —
 * the message says which happened (by comparing sync timestamps) and never claims Jira was
 * contacted when it was not.
 */
export function RefreshButton({
  syncedAt,
  refreshIntervalSeconds,
  className,
}: {
  syncedAt: string;
  refreshIntervalSeconds: number;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [clickedWith, setClickedWith] = useState<string | null>(null);

  const outcome = clickedWith !== null && !pending ? (syncedAt !== clickedWith ? "updated" : "cached") : null;

  useEffect(() => {
    if (!outcome) return;
    const timer = setTimeout(() => setClickedWith(null), 8000);
    return () => clearTimeout(timer);
  }, [outcome]);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => {
          setClickedWith(syncedAt);
          startTransition(() => router.refresh());
        }}
        disabled={pending}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60",
          className,
        )}
      >
        <RefreshCw aria-hidden className={cn("size-3.5", pending && "animate-spin")} />
        {pending ? "Refreshing…" : "Refresh"}
      </button>
      <p aria-live="polite" className="min-h-4 text-right text-xs text-muted-foreground">
        {outcome === "updated"
          ? "Updated with new Jira data"
          : outcome === "cached"
            ? `Showing the latest cached Jira data (refreshed at most every ${refreshIntervalSeconds} seconds)`
            : ""}
      </p>
    </div>
  );
}
