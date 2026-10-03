import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { getHistoryData } from "@/lib/history/history-service";
import { httpStatusForJiraError, toJiraApiError } from "@/lib/jira/errors";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/jira/history — reconstructed history DTO (no raw changelogs). Requires a session. */
export async function GET() {
  if (!(await getSession())) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Sign in to access project data." } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    return NextResponse.json(await getHistoryData(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const jiraError = toJiraApiError(error);
    log("error", "api.history_failed", { code: jiraError.code, status: jiraError.status, path: jiraError.path });
    return NextResponse.json(
      { error: { code: jiraError.code, message: "Historical analytics are temporarily unavailable." } },
      { status: httpStatusForJiraError(jiraError.code), headers: { "Cache-Control": "no-store" } },
    );
  }
}
