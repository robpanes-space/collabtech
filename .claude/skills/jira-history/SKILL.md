---
name: jira-history
description: Rules for Jira changelog-based historical analytics — bulk changelog fetch, history normalization, point-in-time reconstruction, sprint burndown, commitment and scope changes, project trend, throughput, cycle/lead time, recent activity, confidence and availability. Use when changing anything in src/lib/history or src/lib/jira/changelog.ts.
---

# Jira history analytics

Evidence only. Every historical value is reconstructed from actual Jira records (changelog +
current state). Never backfill status transitions, completion dates, story points or sprint
membership. If Jira cannot support a value, return `available: false` with a reason.

## Pipeline

```
current normalized project data (anchor) ─┐
POST /rest/api/3/changelog/bulkfetch ─────┼─► normalize-history ─► issue timelines ─► metrics ─► HistoryDto
GET  /rest/api/3/status (status → category)┘                                  (pure: build-history.ts)
```

- `src/lib/jira/changelog.ts` — bulk fetch: ≤1000 issue IDs per request, `nextPageToken`
  pagination, sequential (no fan-out), shared client retry/429 handling, `fieldIds` filter
  (`status, assignee, priority, labels, resolution` + discovered Sprint and story-point fields).
- `src/lib/jira/history-schemas.ts` — Zod; strips author email/avatars/time zone. `created` is
  epoch ms in bulk fetch (ISO elsewhere).
- `src/lib/history/history-service.ts` — server-only; the whole history dataset is cached as ONE
  unit for 300 s (`unstable_cache`), separate from the 60 s current dashboard. `loadHistory()`
  never throws (history failure never breaks the dashboard).
- `GET /api/jira/history` — session required; no raw changelog, emails or account IDs.

## Scope (same rules as the current-state engine)

| Use | Issues |
|---|---|
| Fetched history | delivery work items (`isDeliveryWorkItem`) ∪ P0/P1 risks |
| Sprint burndown / sprint history | delivery work items |
| Project trend / throughput / cycle time | current project scope (`isInProjectScope`) |
| Recent activity | project-scope work items ∪ risks |

## Field normalization

Classified by `fieldId`: `status` (IDs + names), Sprint (discovered `gh-sprint` field →
sprint ID sets parsed from "1, 3"), story points (discovered field → number|null), `assignee`
(display name only), `priority`, `labels`, `resolution`; everything else → `other`.

## Point-in-time rule (issue-timeline.ts)

Value of a field at instant t = `to` of the last change ≤ t; else `from` of the first change
after t; else the current value (Jira logs changes after creation, not initial values).
The issue does not exist before `createdAt`. Status category comes from the status catalog
(status ID → todo/in_progress/done), never from names.

## Day boundaries

Calendar days are local days in `DASHBOARD_TIME_ZONE` (`calendar.ts`, Intl-based, DST-safe).
A day's value is evaluated at the last millisecond of that local day (capped at now / sprint
close). Jira date-only values are calendar days and never shift. Labels come from
`src/lib/format.ts`.

## Sprint burndown & commitment (sprint-history.ts)

```
start S, end E, close C = completeDate (or E for a closed sprint), cap = min(now, C)
inSprint(i, t)  = created(i) ≤ t ∧ sprint ∈ SprintField(i, t)
committed       = { i : inSprint(i, S) }                    — sprint contents at the start instant
added           = not committed ∧ inSprint at some instant in (S, cap]   (incl. created into it)
removed         = in sprint at/after S ∧ ¬inSprint(i, cap)
scopeChangeCount= enter/leave transitions after S
remaining(d)    = |{ inSprint(i, t_d) ∧ category(i, t_d) ≠ done }|   — reopened work counts again
completedCommitted = committed ∧ inSprint(cap) ∧ done(cap)
finalCompleted  = inSprint(cap) ∧ done(cap);  completionRate = finalCompleted / |inSprint(cap)|
```

- Days after `cap` have `null` values — no future burndown is drawn.
- **Ideal** = committed-remaining × (1 − k/(days−1)): a mathematical reference fixed at the start
  commitment; scope changes never rewrite historical ideal values.
- Story-point series only when every in-sprint item has an estimate at every evaluated instant
  (incl. the start); otherwise `ESTIMATION_INCOMPLETE` — work-item counts are never relabelled.
- Unavailable reasons: `SPRINT_DATES_REQUIRED`, `SPRINT_NOT_STARTED`, `NO_HISTORY` (no work ever
  in the sprint), `LOW_HISTORY_CONFIDENCE`.

## Confidence (confidence.ts)

- **low** (chart hidden): last status change ≠ current status; done with no status change
  recorded; last Sprint change ≠ current Sprint field; missing creation date.
- **medium** (shown + note): statuses evidenced, but some sprint membership is inferred (in the
  sprint now with no Sprint change recorded → assumed since creation), or Sprint field unknown.
- **high**: everything evidenced.

## Project trend (project-trend.ts)

Reconstructed progress of the **current** committed scope (M1–M8, M9 excluded unless
activated, `exclude-from-progress` respected) — `scopeBasis: "current_committed_scope"`, not an
immutable baseline. total(t) = scope items existing at t; completed(t) = done at t; progress via
`roundPercent`. Work items only (units never mix). Daily ≤ 92 days, else weekly. Needs ≥ 2 days.

## Throughput, cycle & lead time (throughput.ts)

Completion = last transition into done, for items done now (reopened items count once, in the
week of final completion; currently reopened items are not counted). Monday-start weeks in the
dashboard time zone, real zero weeks included; shown with ≥ 2 weeks and ≥ 1 completion.
Cycle time = first transition into in_progress → completion; lead time = creation → completion.
Medians only, only with ≥ 5 samples. Velocity remains story-point-only (`velocity: false` while
estimates are incomplete); throughput is never called velocity.

## Recent activity (activity.ts)

Last 30 days, newest first, max 20 (overview shows 8). Status: todo→in_progress "started",
→done "completed"/"risk_resolved", done→not done "reopened"/"risk_reopened"; moves within a
category are noise. Sprint added/removed (sprint-planning batches by the same person to the same
sprint within 15 min are grouped), assignee, story points, priority. Labels, links, ranks and
other fields are dropped. Actor = display name or "Jira user".

## Warnings

`HISTORY_INCOMPLETE`, `BURNDOWN_UNAVAILABLE`, `STORY_POINT_HISTORY_INCOMPLETE`,
`SPRINT_MEMBERSHIP_HISTORY_INCOMPLETE`, `SPRINT_DATES_REQUIRED`, `LOW_HISTORY_CONFIDENCE` —
human-readable messages; UI titles in `history-sections.tsx`.
