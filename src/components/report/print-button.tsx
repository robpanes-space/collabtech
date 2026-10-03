"use client";

import { Printer } from "lucide-react";

/** Opens the browser print dialog ("Save as PDF" works from there). */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none print:hidden"
    >
      <Printer aria-hidden className="size-3.5" />
      Print / Save as PDF
    </button>
  );
}
