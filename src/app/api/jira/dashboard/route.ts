import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/dashboard/get-dashboard-data";
import type { DashboardErrorDto } from "@/lib/dashboard/types";
import { getSession } from "@/lib/auth/server";
import { httpStatusForJiraError, toJiraApiError } from "@/lib/jira/errors";
import { log } from "@/lib/log";

export const runtime = "nodejs";
// Rendered per request (never at build time); Jira responses are cached for 60s by the
// Next.js data cache inside jiraFetch, so Jira is not hit on every request.
export const dynamic = "force-dynamic";

/** GET /api/jira/dashboard — the complete client-facing dashboard DTO. */
export async function GET() {
  // The proxy already rejects unauthenticated requests; this is defense in depth.
  if (!(await getSession())) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Sign in to access project data." } } satisfies DashboardErrorDto,
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const dto = await getDashboardData();
    return NextResponse.json(dto, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const jiraError = toJiraApiError(error);
    // Code and path only — never credentials, headers, bodies or stack traces.
    log("error", "api.dashboard_failed", { code: jiraError.code, status: jiraError.status, path: jiraError.path });
    const body: DashboardErrorDto = {
      error: { code: jiraError.code, message: jiraError.friendlyMessage },
    };
    return NextResponse.json(body, {
      status: httpStatusForJiraError(jiraError.code),
      headers: { "Cache-Control": "no-store" },
    });
  }
}
