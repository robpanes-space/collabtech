"use client";

import { DashboardError } from "@/components/dashboard/dashboard-error";

/**
 * Unexpected render errors in dashboard pages: client-safe message plus the opaque digest
 * (matches the server log entry). Never shows error messages or stacks.
 */
export default function DashboardErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <DashboardError onRetry={reset} reference={error.digest} />;
}
