import Link from "next/link";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/auth/actions";
import { dashboardTimeZone } from "@/lib/format";
import { appVersion } from "@/lib/version";
import { NavLinks } from "./nav-links";

/** Light app shell: brand + three-item navigation + sign out. */
export function SiteHeader({ userEmail, displayName }: { userEmail: string; displayName?: string | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 print:hidden">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex min-w-0 flex-col rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="text-sm font-semibold tracking-tight">
            Jira Custom Dashboard <span className="font-normal text-muted-foreground">· Progress</span>
          </span>
          <span className="text-xs text-muted-foreground">Jira-powered project dashboard</span>
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <nav aria-label="Main">
            <NavLinks />
          </nav>
          <form action={logoutAction} className="flex items-center gap-2">
            <span className="hidden max-w-48 truncate text-xs text-muted-foreground md:inline" title={userEmail}>
              {displayName ?? userEmail}
            </span>
            <button
              type="submit"
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <LogOut aria-hidden className="size-3.5" />
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

export function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="mx-auto flex w-full max-w-7xl min-w-0 flex-1 flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8">
      {children}
    </main>
  );
}

/** Secondary build/time-zone information (non-secret). */
export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-7xl px-4 pb-6 text-xs text-muted-foreground sm:px-6 print:hidden">
      Dashboard {appVersion().label} · Times shown in {dashboardTimeZone()}
    </footer>
  );
}
