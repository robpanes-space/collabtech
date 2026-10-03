---
name: jira-api
description: Jira Cloud REST API reference for this project — auth, Agile and Platform endpoints, pagination, boards, sprints, issues, epics, custom fields, story points, status categories, issue links, retries and errors. Use before writing or reviewing any code that calls Jira.
---

# Jira Cloud REST API

All calls go through `jiraFetch<T>()` / `jiraPaginate<T>()` in `src/lib/jira/client.ts`
(server-only). Never call `fetch` against Jira anywhere else.

## Authentication

- Basic auth: `Authorization: Basic base64(JIRA_EMAIL:JIRA_API_TOKEN)`.
- Token created at https://id.atlassian.com/manage-profile/security/api-tokens.
- Headers: `Accept: application/json`.
- The token inherits the user's permissions; the user needs Browse Projects on `SCRUM` and
  access to the board.

## Agile API (`/rest/agile/1.0`)

| Purpose | Endpoint |
|---|---|
| Board | `GET /board/{boardId}` |
| Board config (columns, estimation field) | `GET /board/{boardId}/configuration` |
| Sprints | `GET /board/{boardId}/sprint?state=active,future,closed` |
| Sprint | `GET /sprint/{sprintId}` |
| Sprint issues | `GET /sprint/{sprintId}/issue?fields=...` |
| Backlog | `GET /board/{boardId}/backlog?fields=...` |
| Epics on board | `GET /board/{boardId}/epic` |
| Board discovery | `GET /board?projectKeyOrId=SCRUM` |

Sprint object: `id, self, state (active|future|closed), name, startDate?, endDate?,
completeDate?, goal?, originBoardId?`. Dates may be absent for future sprints.

## Platform API (`/rest/api/3`)

| Purpose | Endpoint |
|---|---|
| Health / identity | `GET /myself` |
| Project | `GET /project/{key}` |
| Field discovery | `GET /field` |
| Search | `GET /search/jql?jql=...&fields=...&nextPageToken=...` (the old `/search` is deprecated) |
| Issue + changelog | `GET /issue/{key}?expand=changelog` |
| Priorities | `GET /priority` |

Use Platform endpoints only where Agile lacks data (project name, field metadata, changelog).
JQL is an implementation detail — never shown to clients.

## Pagination

- Agile: `startAt`, `maxResults` (≤50 typical), response `isLast` (sprints) or `total`
  (issues). Loop until `isLast === true` or `startAt + values.length >= total` or an empty page.
- `/search/jql`: loop on `nextPageToken` until absent (`isLast: true`).
- Always cap pages (`maxPages`) to avoid infinite loops on malformed responses.

## Issues, epics, hierarchy

- `fields.issuetype.name` (Epic, Story, Task, Bug, Sub-task); `issuetype.hierarchyLevel`
  (1 = epic, 0 = standard, -1 = subtask).
- Team-managed and modern company-managed projects use `fields.parent` for epic membership.
  Legacy company-managed may use an "Epic Link" custom field — discover via `/field`.
- Milestones (M1–M8) are represented by epics in this project; confirm against live data.

## Custom fields & story points

- **Never hard-code `customfield_XXXXX` in logic.** Resolution order:
  1. `JIRA_STORY_POINTS_FIELD` env var (optional)
  2. Board configuration `estimation.field.fieldId`
  3. `/rest/api/3/field` lookup by name: "Story point estimate" (team-managed) or "Story Points"
- Story points may be `null`, missing, or non-numeric → treat as "unestimated", not 0.

## Normalization (`src/lib/jira/normalize.ts`)

Pure functions; no I/O and no clock (`now` is passed in). Raw shapes never leave this module.

### Status
`statusCategory.key` is authoritative: `new` → `todo`, `indeterminate` → `in_progress`,
`done` → `done`, anything else (incl. Jira's `undefined` "No Category") → `unknown`.
Status names (e.g. "QA Review") are **never** interpreted.

### Story points
Field ID from `resolveStoryPointsField()`. Keep only finite, non-negative **numbers**
(incl. 0 and decimals). Missing / null / strings (even `"8"`) / negative / NaN → `null`.
Never throws per issue.

### Hierarchy
- `parent` is an Epic (`hierarchyLevel === 1`, or name "Epic" when level is absent)
  → `epicKey = parent.key`, `parentKey = null`.
- `parent` is anything else, or its type is unknown → `parentKey = parent.key`, `epicKey = null`.
- Legacy Epic Link (`JIRA_EPIC_LINK_FIELD`) is used **only** when there is no `parent`.
- Epic membership is never inherited or inferred (a subtask's `epicKey` stays `null`).
- `isSubtask`: `issuetype.subtask === true` or `hierarchyLevel === -1`.

### Blockers
On issue X, a link whose type is blocker-like (name `Block`/`Blocks`, or inward text
contains "blocked by") with `inwardIssue: Y` means **"X is blocked by Y"** → Y is a blocker.
`outwardIssue` means "X blocks Z" → not a blocker of X. Other link types are ignored.
Blockers whose own status category is `done` are dropped. Keys are deduplicated.
`blocked = blockers.length > 0 || blockedByStatus`, where `blockedByStatus` is true only when
the status name matches `JIRA_BLOCKED_STATUSES` exactly (trimmed, case-insensitive; empty by
default) **and** the status category is not done (done always wins). An issue matching both is
one blocked item. Names merely containing "blocked" are never matched.
Age, incompleteness, P0 labels, etc. never make an issue blocked.

### Risk severity (P0/P1) — precedence
1. `JIRA_RISK_FIELD` custom field (string, `{value}`/`{name}` option, or array; P0 wins).
2. Priority name starting with a standalone `P0`/`P1` (e.g. "P0", "P1 - Major").
   Standard priorities ("Highest", "High") are **not** mapped.
3. Labels (case-insensitive exact): `p0`, `priority-p0`, `risk-p0`, `p1`, `priority-p1`,
   `risk-p1`. P0 wins if both present.
4. Summary convention: `/^\s*[A-Z]{1,4}-\d{1,4}\s+(P[01])\b/i` — e.g. "I-01 P0 - …".
   Free text such as "Review P0 risks" or "SP01" does not match.

Result carries `riskSeverity` and `riskSeveritySource`.

### Dates
Timestamps → UTC ISO via `Date.parse`; unparseable → `null`. `duedate` is kept as a
`YYYY-MM-DD` calendar date (no time-zone shift). Formatting is a UI concern.

### Sprints & project
- `activeSprint` is exactly what Jira reports (`state === "active"`, first if several;
  all in `activeSprints`). It is never overridden — e.g. "SCRUM Sprint 0" stays active.
- `migrationSprints`: sprints whose name matches `/^\s*MIG\s+S(\d{1,3})\b/i`, ordered by that
  number. Other sprints remain in `sprints` (Jira order).
- Sprint membership comes from `GET /sprint/{id}/issue`; project issues come from
  `/search/jql`. Issues are merged by key (search record wins; sprint payload supplies
  `sprint.id` and issues missing from search).
- Milestones = epics; children = issues whose `epicKey` is the epic. `milestoneNumber` parsed
  from an `M<n>` title prefix (metadata only); ordered by number, then key.
- `loadNormalizedProjectData()` (`project-data.ts`) fetches and normalizes everything.

## Changelog (history) — `src/lib/jira/changelog.ts`

- `POST /rest/api/3/changelog/bulkfetch` with `{ issueIdsOrKeys (≤1000), maxResults: 1000,
  fieldIds?, nextPageToken? }` → `{ issueChangeLogs: [{ issueId, changeHistories: [{ id,
  created, author, items: [{ field, fieldId, from, fromString, to, toString }] }] }],
  nextPageToken? }`. Batches run sequentially; histories of one issue may span pages (merged).
- **Never** fetch changelogs per issue and never use `expand=changelog` as the primary path.
- `created` is epoch milliseconds here. Authors include `emailAddress` — the schema strips it.
- Field filter: `status, assignee, priority, labels, resolution` + the discovered Sprint field
  (`schema.custom = com.pyxis.greenhopper.jira:gh-sprint`, via `resolveSprintField()`) and the
  story-point field. Never hard-code their `customfield_*` IDs.
- Sprint history values are comma-separated sprint IDs (`"" → "1"`, `"1" → "1, 3"`).
- Status history values are status IDs; map them with `GET /rest/api/3/status` (category key).
- `jiraFetch` supports `method: "POST"` + JSON `body` for read-style endpoints only; POST
  responses are never data-cached (the history service caches its derived DTO for 300 s).
- History rules: `.claude/skills/jira-history/SKILL.md`.

## Retries & errors

| Status | `JiraApiError.code` | Retry |
|---|---|---|
| 401 | `INVALID_CREDENTIALS` | no |
| 403 | `FORBIDDEN` | no |
| 404 | `NOT_FOUND` | no |
| 429 | `RATE_LIMITED` | yes, honour `Retry-After` (bounded) |
| 5xx | `JIRA_UNAVAILABLE` | yes, short backoff (bounded) |
| abort | `TIMEOUT` | no |
| network | `NETWORK_ERROR` | no |
| Zod fail | `INVALID_RESPONSE` | no |

Error messages must never contain credentials or Authorization headers.
