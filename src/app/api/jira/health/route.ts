import { NextResponse } from "next/server";
import { getBoard, getSprints } from "@/lib/jira/agile";
import { getJiraConfig } from "@/lib/jira/config";
import { toJiraApiError, type JiraErrorCode } from "@/lib/jira/errors";
import { getMyself, getProject, resolveStoryPointsField } from "@/lib/jira/issues";
import { getSession } from "@/lib/auth/server";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckResult = {
  name: "configuration" | "credentials" | "project" | "board" | "sprints" | "storyPoints";
  ok: boolean;
  detail: string | null;
  error: { code: JiraErrorCode; message: string } | null;
};

async function runCheck(
  name: CheckResult["name"],
  check: () => Promise<string | null>,
): Promise<CheckResult> {
  try {
    return { name, ok: true, detail: await check(), error: null };
  } catch (error) {
    const jiraError = toJiraApiError(error);
    // Log code and path only — never headers, credentials, or response bodies.
    log("warn", "jira.health_check_failed", { check: name, code: jiraError.code, path: jiraError.path });
    return {
      name,
      ok: false,
      detail: null,
      error: {
        code: jiraError.code,
        // CONFIG_MISSING detail lists variable *names* only (never values) to aid setup.
        message: jiraError.code === "CONFIG_MISSING" ? jiraError.message : jiraError.friendlyMessage,
      },
    };
  }
}

/**
 * GET /api/jira/health — verifies Jira connectivity and configuration. Requires a session
 * (it reveals project/board names). Never cached; returns no credentials or account identifiers.
 */
export async function GET() {
  if (!(await getSession())) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Sign in to access project data." } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const checkedAt = new Date().toISOString();

  const configuration = await runCheck("configuration", async () => {
    const config = getJiraConfig();
    return `Project ${config.projectKey}, board ${config.boardId}`;
  });
  if (!configuration.ok) {
    return NextResponse.json(
      { status: "error", checkedAt, checks: [configuration] },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const credentials = await runCheck("credentials", async () => {
    await getMyself({ revalidate: false });
    return "Authenticated with Jira";
  });
  if (!credentials.ok) {
    return NextResponse.json(
      { status: "error", checkedAt, checks: [configuration, credentials] },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const checks = await Promise.all([
    runCheck("project", async () => {
      const project = await getProject(undefined, { revalidate: false });
      return `${project.name} (${project.key})`;
    }),
    runCheck("board", async () => {
      const board = await getBoard();
      return `${board.name} (${board.type})`;
    }),
    runCheck("sprints", async () => {
      const sprints = await getSprints();
      const active = sprints.filter((sprint) => sprint.state === "active");
      return `${sprints.length} sprints found, ${active.length} active${
        active[0] ? `: ${active[0].name}` : ""
      }`;
    }),
    runCheck("storyPoints", async () => {
      const resolution = await resolveStoryPointsField();
      return resolution.fieldId
        ? `Story points field resolved via ${resolution.source}`
        : "No story points field found — progress will use work item counts";
    }),
  ]);

  const all = [configuration, credentials, ...checks];
  const status = all.every((check) => check.ok) ? "ok" : "degraded";

  return NextResponse.json(
    { status, checkedAt, checks: all },
    { status: status === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
