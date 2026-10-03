import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Page section with a semantic heading. */
export function Section({
  id,
  title,
  description,
  action,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className={cn("flex min-w-0 flex-col gap-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id={`${id}-heading`} className="text-base font-semibold tracking-tight">
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Neutral surface for grouped content. */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("min-w-0 rounded-xl border border-border bg-card p-5", className)}>{children}</div>;
}

/** Supplementary explanation; the essential text is always visible without hovering. */
export function InfoHint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={label}
        className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Info aria-hidden className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1 rounded-lg border border-dashed border-border px-4 py-5 text-sm">
      <div className="flex items-center gap-2 font-medium">
        {icon}
        {title}
      </div>
      {children ? <p className="text-muted-foreground">{children}</p> : null}
    </div>
  );
}

/** Small definition list item: label above a value. */
export function Stat({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}
