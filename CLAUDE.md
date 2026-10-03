# Jira Custom Dashboard — Claude Instructions

Read-only, client-facing dashboard for the Jira Scrum project with key `SCRUM`,
for client project progress. It is NOT a Jira replacement.

## Non-negotiable rules

1. **Jira is the source of truth.** Every value shown to a client derives from the Jira REST API.
2. **Never invent Jira values.** No fake data outside explicit test fixtures (`tests/**/fixtures`).
   Never hard-code progress %, active sprint, issue counts, sprint names, or milestones.
3. **Credentials stay server-side.** `JIRA_EMAIL` / `JIRA_API_TOKEN` are read only in
   `src/lib/jira/config.ts` (marked `server-only`). Never prefix them with `NEXT_PUBLIC_`.
4. **Never expose `JIRA_API_TOKEN` to React/browser code**, logs, error messages, or API responses.
5. **Dashboard calculations are deterministic** pure functions — same input, same output.
   Pass `now: Date` explicitly instead of calling `Date.now()` inside metric functions.
6. **Keep four layers separate:**
   1. raw Jira response — `src/lib/jira/schemas.ts` (Zod) + `client.ts`, `agile.ts`, `issues.ts`
   2. normalized domain objects — `src/lib/jira/normalize.ts`, `src/lib/jira/types.ts`
   3. calculated dashboard metrics — `src/lib/dashboard/*`
   4. React rendering — `src/components/**`, `src/app/**`
7. **No Jira REST calls in React components.** Components receive DTOs as props.
8. **No duplicated metric formulas.** A component never computes a percentage itself.
9. **Every metric has exactly one implementation** under `src/lib/dashboard/`, documented in
   `.claude/skills/jira-metrics/SKILL.md`.
10. Prefer small, reusable components.
11. Do not over-engineer: no Redux, GraphQL, queues, microservices, databases, or Vite.
12. Before calling work complete, run and pass:
    `npm run lint && npm run typecheck && npm run test && npm run build`
13. **Never silently swallow Jira API errors.** Throw/return a typed `JiraApiError`; surface it.
14. If Jira is unavailable, render a useful error state; render every section that still has data.
15. **Client-friendly terminology:** "Work Items" not "Issues", "Milestone" not "Epic Link",
    never show JQL. Every KPI shows a provenance line (e.g. "Based on story points").

## Architecture

```
Jira Cloud → Jira REST API → src/lib/jira/client.ts (server-only)
  → src/lib/jira/{agile,issues}.ts → normalize.ts → src/lib/dashboard/*
  → Server Components / route handlers (src/app) → src/components (props only)
```

Normalization (`src/lib/jira/normalize.ts`) is pure and may call pure aggregators from
`src/lib/dashboard/` (e.g. `summarizeWork`) so formulas are never duplicated; the dashboard
layer must not import Jira fetch modules.

## Conventions

- Data freshness: `export const revalidate = 60` on pages / `next: { revalidate: 60 }` on fetch.
- Custom field IDs (story points, risk severity) come from env config or field discovery
  (`/rest/api/3/field`), never hard-coded literals in logic.
- The M1–M8 milestones and "MIG S1–S8" sprint names are **development context only**.
  Runtime data must come from Jira.
- Risk severity detection order: `JIRA_RISK_FIELD` → explicit P0/P1 priority → labels →
  summary convention (`I-01 P0 - ...`). Output `riskSeverity: "P0" | "P1" | null`.
- `activeSprint` is exactly what Jira reports — never substitute a migration sprint.
  Use `migrationSprints` for the roadmap.
- Atlassian OAuth is identity only (`read:me`): never store/log the OAuth token or use it for
  Jira data — Jira is always read with the server's service account.
- Access control: every page and Jira API requires a session (`src/proxy.ts` + `requireSession` /
  `getSession`). Sessions hold only email + password fingerprint + timestamps — never Jira data
  or credentials. Public routes: `/login`, `/api/health` only.
- Dates: format only via `src/lib/format.ts` (DASHBOARD_TIME_ZONE; Jira date-only values are
  calendar dates). Jira links only via `jiraUrl` from the DTO (`src/lib/jira/links.ts`).
- Logging: `log()` from `src/lib/log.ts` (structured, redacted). Never log tokens, cookies,
  passwords or raw emails.
- History: changelog-based analytics live only in `src/lib/history` (rules:
  `.claude/skills/jira-history/SKILL.md`). Evidence only — never backfill or estimate history;
  return `available: false` with a reason instead. Keep it separate from the current-state engine.
- Data readiness (`src/lib/readiness`) only REPORTS Jira data problems with recommended Jira
  actions — never compensate for bad Jira data in calculations, never write to Jira.
- Work-item scope/exclusions live only in `src/lib/dashboard/scope.ts`; percentages are
  rounded only by `roundPercent` in `src/lib/dashboard/metrics.ts`.
- The UI consumes `DashboardDto` (`src/lib/dashboard/types.ts`) from `getDashboardData()` /
  `GET /api/jira/dashboard` — one data load per page, never per card.

## Agents & skills

- Agents: `.claude/agents/` — architect, jira-integration, dashboard-ui, analytics,
  qa-reviewer, security-reviewer.
- Skills: `.claude/skills/` — jira-api, jira-metrics, dashboard-design, typescript-quality, testing.

All Jira API code should be authored or reviewed by **jira-integration**; all metric formulas
by **analytics**; any change touching env vars, route handlers, or logging by **security-reviewer**.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
