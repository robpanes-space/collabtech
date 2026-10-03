import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Subtle Jira deep link ("SCRUM-14 ↗"). The URL comes from the backend DTO (safe browse URL
 * built from the configured site origin); without one, the key renders as plain text.
 */
export function JiraLink({ issueKey, url, className }: { issueKey: string; url: string | null; className?: string }) {
  if (!url) return <span className={className}>{issueKey}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${issueKey} (opens in Jira in a new tab)`}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-sm underline-offset-2 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
    >
      {issueKey}
      <ArrowUpRight aria-hidden className="size-3" />
    </a>
  );
}
