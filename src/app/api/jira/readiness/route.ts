import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/server";
import { httpStatusForJiraError, toJiraApiError } from "@/lib/jira/errors";
import { log } from "@/lib/log";
import { getReadinessData } from "@/lib/readiness/readiness-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** GET /api/jira/readiness — read-only data-readiness report (admin; see DASHBOARD_ADMIN_EMAILS). */
export async function GET() {
  const session = await getAdminSession();
  if (session === null) return json({ error: { code: "UNAUTHENTICATED", message: "Sign in to access project data." } }, 401);
  if (session === "forbidden") return json({ error: { code: "FORBIDDEN", message: "This view is limited to administrators." } }, 403);
  try {
    return json(await getReadinessData());
  } catch (error) {
    const jiraError = toJiraApiError(error);
    log("error", "api.readiness_failed", { code: jiraError.code, status: jiraError.status, path: jiraError.path });
    return json({ error: { code: jiraError.code, message: jiraError.friendlyMessage } }, httpStatusForJiraError(jiraError.code));
  }
}
