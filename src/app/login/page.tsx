import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogIn } from "lucide-react";
import { getAuthConfig } from "@/lib/auth/config";
import { loginErrorMessage } from "@/lib/auth/login-errors";
import { getSession } from "@/lib/auth/server";
import { safeNextPath } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const error = loginErrorMessage(params.error);
  const config = getAuthConfig();
  if (config.status !== "misconfigured" && (await getSession())) redirect(next);

  const atlassianEnabled = config.status === "enabled" && config.atlassian !== null;
  const passwordEnabled = config.status === "enabled" && config.users.size > 0;

  return (
    <main id="main" className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Jira Custom Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Project progress from Jira</p>
        </div>
        {config.status === "misconfigured" ? (
          <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-center text-sm text-muted-foreground">
            Sign-in is not available right now. Please contact your project team.
          </p>
        ) : (
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
            {error ? (
              <p role="alert" data-error={String(params.error)} className="text-sm text-status-critical-text">
                {error}
              </p>
            ) : null}
            {atlassianEnabled ? (
              // Plain link (not next/link): starts a server redirect to Atlassian; never prefetched.
              <a
                href={`/api/auth/atlassian/start${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <LogIn aria-hidden className="size-4" />
                Sign in with Atlassian
              </a>
            ) : null}
            {atlassianEnabled && passwordEnabled ? (
              <div className="flex items-center gap-3 text-xs text-muted-foreground" role="separator" aria-label="or">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>
            ) : null}
            {passwordEnabled ? <LoginForm next={next} secondary={atlassianEnabled} /> : null}
          </div>
        )}
      </div>
    </main>
  );
}
