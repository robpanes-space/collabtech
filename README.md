# Jira Custom Dashboard

A read-only, client-facing dashboard for the Jira Scrum project `SCRUM`,
showing client project progress.

Jira is the source of truth. The dashboard interprets live Jira data into project progress,
sprint progress, milestone progress, blockers, P0/P1 risks, health, and a delivery roadmap — so
clients can understand status without knowing Jira. It does not edit Jira.

## Architecture

```
Jira Cloud
  ↓  Jira REST API (Agile 1.0 + Platform v3)
src/lib/jira/client.ts        server-only fetch: auth, timeout, retries, pagination, typed errors
  ↓
src/lib/jira/{agile,issues}.ts endpoint wrappers, validated with Zod (schemas.ts)
  ↓
src/lib/jira/normalize.ts     raw Jira → domain types (types.ts); pure, fixture-tested
src/lib/jira/project-data.ts  loadNormalizedProjectData(): fetch + normalize in one call
  ↓
src/lib/dashboard/*           pure, deterministic metric engine; buildDashboardDto()
  ↓                             → DashboardDto (src/lib/dashboard/types.ts)
src/app (Server Components + GET /api/jira/dashboard)
  ↓
src/components/*              React UI — receives DTOs as props, never calls Jira
```

Stack: Next.js 16 (App Router, Node runtime), React 19, TypeScript (strict), Tailwind CSS 4,
shadcn/ui, Recharts, lucide-react, Zod, Vitest.

Claude Code agents and skills for this repo live in `.claude/` — see `CLAUDE.md`.

## Requirements

- Node.js 20.9+ (22 LTS recommended)
- A Jira Cloud site with access to project `SCRUM` and its Scrum board
- A Jira account with **Browse Projects** permission on `SCRUM`

## Jira setup

1. **Create an API token**
   1. Sign in as the account the dashboard will use (a dedicated read-only service account is
      recommended).
   2. Go to <https://id.atlassian.com/manage-profile/security/api-tokens>.
   3. Click **Create API token**, name it (e.g. `jira-dashboard`), set an expiry, copy it.
2. **Find the board ID** — open the board in Jira; the URL contains `/boards/<id>`.
3. **Story points (optional)** — the field is auto-discovered from the board's estimation
   configuration or field metadata. To force it, set `JIRA_STORY_POINTS_FIELD`
   (e.g. `customfield_10016`).

## Environment configuration

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `JIRA_BASE_URL` | yes | e.g. `https://your-domain.atlassian.net` |
| `JIRA_EMAIL` | yes | Email of the Jira account that owns the API token |
| `JIRA_API_TOKEN` | yes | Jira API token |
| `JIRA_PROJECT_KEY` | no | Defaults to `SCRUM` |
| `JIRA_BOARD_ID` | yes | Scrum board ID |
| `JIRA_STORY_POINTS_FIELD` | no | Story points custom field override |
| `JIRA_RISK_FIELD` | no | Custom field holding P0/P1 severity (highest-precedence risk signal) |
| `JIRA_EPIC_LINK_FIELD` | no | Legacy "Epic Link" field; used only for issues without a parent |
| `JIRA_BLOCKED_STATUSES` | no | Comma-separated status names that mean "blocked", e.g. `Blocked` (exact, case-insensitive; links always count; done work never counts) |
| `DASHBOARD_TIME_ZONE` | prod | IANA time zone for displayed timestamps, e.g. `Asia/Manila` (default `UTC`) |
| `DASHBOARD_USERS` | prod* | Password users (fallback/admin): `email:hash` entries (`npm run auth:hash-password`) |
| `DASHBOARD_ALLOWED_EMAILS` | with Atlassian | Emails allowed to "Sign in with Atlassian" (password users are allowed too) |
| `DASHBOARD_JIRA_PROJECT_ACCESS` | no | `true` = anyone with access to the Jira project can sign in with Atlassian (invite them in Jira) |
| `ATLASSIAN_CLIENT_ID` / `ATLASSIAN_CLIENT_SECRET` / `ATLASSIAN_CALLBACK_URL` | no | Atlassian OAuth app for "Sign in with Atlassian" (identity only, `read:me`) |
| `DASHBOARD_SESSION_SECRET` | prod | ≥ 32 random chars (`npm run auth:session-secret`) |
| `DASHBOARD_SESSION_HOURS` | no | Session lifetime, default 168 |
| `DASHBOARD_JIRA_LINKS` | no | `false` hides "SCRUM-14 ↗" Jira links |
| `DASHBOARD_AUTH_DISABLED` | no | `true` skips sign-in in local development only (ignored in production) |
| `DASHBOARD_ADMIN_EMAILS` | no | Emails allowed to open `/admin/readiness` (unset = all signed-in users) |

Never prefix these with `NEXT_PUBLIC_`. Full reference: [`docs/deployment.md`](docs/deployment.md).

## Development

```bash
npm install
npm run dev          # http://localhost:3000
```

The dashboard requires sign-in. For local development either add yourself to
`DASHBOARD_USERS` (plus `DASHBOARD_SESSION_SECRET`) in `.env.local`, or set
`DASHBOARD_AUTH_DISABLED=true` (development only).

Verify the Jira connection (signed in): <http://localhost:3000/api/jira/health>.
Public liveness check: <http://localhost:3000/api/health>.

The full dashboard data contract (one request powers the whole page):
<http://localhost:3000/api/jira/dashboard>. Errors return `{ "error": { "code", "message" } }`
with a client-safe message.

```json
{ "status": "ok", "checks": [
  { "name": "configuration", "ok": true, ... },
  { "name": "credentials", "ok": true, ... },
  { "name": "project", "ok": true, "detail": "Example Team (SCRUM)" },
  { "name": "board", "ok": true, ... },
  { "name": "sprints", "ok": true, "detail": "8 sprints found, 1 active: ..." },
  { "name": "storyPoints", "ok": true, ... } ] }
```

### Dashboard pages

| Route | Content |
|---|---|
| `/` | Project health, progress, current sprint, KPIs, blockers, risks, roadmap, milestones, charts, data notes |
| `/sprints` | Roadmap and all migration sprints (plus any other active Jira sprints) |
| `/sprints/[sprintId]` | Sprint goal, metrics, work items grouped Blocked / In progress / To do / Done |
| `/risks` | Risk register with All / P0 / P1 / Open / Resolved filters |

Each page renders on the server from one cached dashboard payload (Jira is read at most once
per ~60 seconds). "Refresh" re-renders the page; it does not bypass the cache.

### npm commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate Next route types + `tsc --noEmit` |
| `npm run test` | Vitest unit tests |
| `npm run auth:hash-password` | Hash a dashboard user's password for `DASHBOARD_USERS` |
| `npm run auth:session-secret` | Generate a `DASHBOARD_SESSION_SECRET` |

Run `lint`, `typecheck`, `test`, and `build` before considering any change complete.

## Dashboard metric definitions

Full formulas live in `.claude/skills/jira-metrics/SKILL.md`; each has exactly one
implementation in `src/lib/dashboard/`. Every KPI displays its provenance
(e.g. "Based on story points").

| Metric | Formula |
|---|---|
| Work-item scope | Stories, Tasks, Bugs. Excluded: epics, subtasks, risk-register items (`I-01 P0 - …`), items labelled `exclude-from-progress`, and M9 work until it enters a sprint or starts. |
| Overall progress | completed story points ÷ total story points × 100; falls back to completed work items ÷ total work items when estimates are missing. Never an average of sprint percentages. |
| Sprint progress | completed sprint work ÷ total sprint work × 100 (same weighting rule; 0% for an empty sprint). Story points are used only when every work item is estimated; the story-point coverage % is always shown. Epics and subtasks are not counted as work items. |
| Milestone progress | completed child work ÷ total child work × 100 for each epic (M1–M8) |
| Open blockers | unresolved work items with an unresolved "is blocked by" link, or a status listed in `JIRA_BLOCKED_STATUSES` |
| P0 / P1 risks | unresolved items with severity P0 / P1 (risk field → `P0`/`P1` priority → labels → `I-01 P0 - …` summary convention) |
| Sprint health | **future** · **complete** (closed or all done) · **blocked** (work blocked by an open P0) · **at-risk** (blocked items, or ≥75% elapsed with <50% done, or ≥90% elapsed with <75% done) · **healthy**. Deterministic rules, not prediction. |
| Velocity | committed vs completed story points per closed migration sprint; unavailable (never replaced by counts) unless every item is estimated. Work-item throughput is provided separately. |
| Milestone health | **complete** (all work done, no open P0) · **blocked** (open P0 risk or work blocked by a P0) · **at-risk** (open P1 or blocked work) · **healthy** |
| Workload | open work items per assignee ("Unassigned" included) |

Data refreshes via Next.js revalidation every **60 seconds**. Moving a Jira story
To Do → In Progress → Done appears on the dashboard after the next revalidation.

### Status report & data confidence

- **`/report`** — compact, printable stakeholder report built only from the existing dashboard
  and history data: overall progress, project health, current and next sprint, work completed
  in the last 7 / 14 / 30 days (final transitions to done), current blockers, open P0/P1 risks,
  milestone status and recent activity. "Print / Save as PDF" uses the browser print dialog
  (the app shell is hidden when printing).
- **Data confidence** (Overview and report) — a client-safe **Good / Limited / Low** signal of
  how complete the Jira data is (sprint schedule, estimates, milestone assignment, unused open
  sprints, history consistency, Jira fields). Derived deterministically from the readiness
  checks; it never includes delivery risk (P0s and blockers are in project health) and never
  exposes the admin checklist.

### Data readiness (admin)

`/admin/readiness` (and `GET /api/jira/readiness`) checks whether Jira data is clean enough for
client reporting: sprint planning and dates, empty active sprints, story-point coverage,
committed work without a milestone, label-based exclusions (`exclude-from-progress`,
`project-control`), open P0/P1 risks, blocker detection (links vs `JIRA_BLOCKED_STATUSES`),
history consistency, and burndown/throughput/trend readiness — each with a recommended Jira
action. It is read-only and never changes Jira. Client pages show only client-relevant notes.
Details and project conventions: [`docs/jira-data-readiness.md`](docs/jira-data-readiness.md).

### Historical analytics (Jira changelog)

`GET /api/jira/history` (signed in) returns reconstructed history: recent activity, sprint
burndowns with commitment and scope changes, project progress over time, weekly throughput,
cycle/lead time, availability and warnings. Full rules: `.claude/skills/jira-history/SKILL.md`.

| Metric | Definition |
|---|---|
| Recent activity | Meaningful changes in the last 30 days (started, completed, reopened, sprint changes, assignee/estimate/priority, risk resolved). Sprint-planning batches are grouped. |
| Sprint burndown | Daily remaining work items reconstructed from status + Sprint-field history; days in `DASHBOARD_TIME_ZONE`; reopened work counts again; no future values. Story points only with complete estimate history. |
| Commitment | Work in the sprint at the sprint **start** instant (not today's contents). Added / removed after start are reported separately. |
| Ideal line | Mathematical reference from the start commitment to zero; never rewritten by scope changes. |
| Project progress over time | Reconstructed progress of the **current** committed scope (work items). |
| Throughput | Work items per week by their final transition to done. |
| Cycle / lead time | Median days (in progress → done / created → done), only with ≥ 5 items. |

History is fetched with one bulk changelog request (≤ 1000 issues per request) and cached as one
unit for **5 minutes**, separately from the 60-second current dashboard. If history fails, the
dashboard still renders and the history sections say "Historical analytics temporarily
unavailable". When Jira history is insufficient (e.g. a sprint has no dates or has not started),
the chart is replaced by an explanation — nothing is estimated or backfilled.

### Sprints shown on the roadmap

The **Current Sprint** is always whatever Jira marks active (e.g. a setup sprint such as
"SCRUM Sprint 0"). The delivery roadmap additionally lists sprints named `MIG S<n> - …`,
ordered by `<n>`; this classification never changes Jira's active sprint.

### Assumptions pending real Jira validation

Normalization is built and tested against synthetic fixtures. Confirm against the live
`SCRUM` project (via `/api/jira/health` and a one-off inspection):

- Epics use `parent` (team-managed) rather than a legacy Epic Link field.
- Story points field is found automatically (`storyPoints` health check).
- The blocker link type is the standard "Blocks" / "is blocked by".
- Risk items ("I-01 P0 - …") are standard Tasks; whether they sit under milestone epics
  and/or in sprints (they currently count as work items wherever they appear).
- Whether any P0/P1 priority scheme, risk custom field, or "Blocked" status exists.
- Subtasks are used rarely enough that excluding them from work-item counts is acceptable.

## Security notes

- Jira credentials are read only in `src/lib/jira/config.ts`, which imports `server-only` —
  importing it from a client component fails the build.
- Jira calls happen only in server modules, Server Components, and route handlers.
- Errors returned to the browser contain a code and a friendly message — never credentials,
  Authorization headers, or raw Jira response bodies. Logs contain error code and path only.
- `.env*` files are gitignored (except `.env.example`).
- Use a least-privilege Jira account and rotate the API token periodically.
- Sign in with Atlassian (identity only) or email + password; both require an allowlisted email
  and create the same session. Atlassian tokens are never stored or used for Jira data — the
  dashboard always reads Jira through the server's service account.
- Every page and Jira API requires a signed-in, allowlisted user (`src/proxy.ts` + server checks).
  Unauthenticated pages redirect to `/login`; APIs return `401`.
- Nonce-based Content-Security-Policy and standard security headers on every response.
- The Jira site URL is intentionally visible in "SCRUM-14 ↗" links (not a secret).

Details: [`docs/deployment.md`](docs/deployment.md#8-security).

## Deployment

See [`docs/deployment.md`](docs/deployment.md) (Vercel or any Node.js host, environment
variables, users, health endpoints, caching, security headers) and the
[`client launch checklist`](docs/client-launch-checklist.md).

```bash
npm ci && npm run build && npm run start
```
