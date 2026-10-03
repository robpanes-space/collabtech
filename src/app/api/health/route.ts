import { NextResponse } from "next/server";
import { appVersion } from "@/lib/version";
import { validateEnvironment } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — public liveness check. 200 when the app is running and fully configured,
 * 503 when required configuration is missing. Exposes no Jira metadata or variable names
 * (those are in server logs and the authenticated /api/jira/health).
 */
export function GET() {
  const report = validateEnvironment();
  return NextResponse.json(
    { status: report.ok ? "ok" : "misconfigured", version: appVersion().label },
    { status: report.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
