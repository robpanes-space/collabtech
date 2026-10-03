---
name: jira-metrics
description: Canonical formulas for every dashboard KPI (progress, sprint completion, milestones, blockers, risks, velocity, workload, health). Use when implementing, changing, or reviewing anything in src/lib/dashboard or any KPI shown in the UI.
---

# Dashboard metric formulas (production)

Pipeline: `NormalizedProjectData` → `buildDashboardDto(data, now)` (`src/lib/dashboard/dashboard.ts`)
→ `DashboardDto` (`src/lib/dashboard/types.ts`) → `GET /api/jira/dashboard`.

Rules: every metric is one pure function in `src/lib/dashboard/`, unit-tested, deterministic
(`now` is passed in), and carries provenance (`MetricValue.source` + `description`).
React never computes metrics.

## Rounding — `metrics.ts` (the only place percentages are rounded)

`roundPercent(raw)`: non-finite → 0; clamp [0,100]; `Math.round`, except never 100 unless raw is
exactly 100 and never 0 unless raw is exactly 0 (99.6 → 99, 0.3 → 1). DTOs carry the rounded
`progress` plus `progressRaw` / `raw`. Never NaN or Infinity.

## Work-item scope — `scope.ts` (the only place exclusions live)

**Delivery work item** (`isDeliveryWorkItem`) — used for sprint and milestone metrics:
1. `isWorkItem`: not an Epic (milestone container) and not a Subtask (parent story carries the
   estimate; counting both double-counts).
2. Not a risk-register item — `riskRegisterId !== null` ("I-01 P0 - …" summary convention).
   Risk items track risk, not delivery effort. Issues flagged P0/P1 only by label/priority/field
   remain delivery work.
3. No label in `excludedLabels` (`exclude-from-progress`, `project-control`) — explicit
   meta/control opt-out; never inferred from titles.

**Project scope** (`isInProjectScope`) — overall progress, project totals, status distribution,
workload: delivery work items, minus work under a future/optional milestone
(`futureMilestoneNumbers`, default `[9]`) **until it enters delivery** (status not To Do, or in an
active/closed sprint). Sprints count everything Jira put in them; the M9 milestone still shows its
own progress but is `inProjectScope: false` and excluded from milestone totals.

Ordinary Stories, Tasks and Bugs are never excluded implicitly.

## Progress — `summarizeWork()` (`work-progress.ts`), shared by project, sprint, milestone

```
estimationCoverage = estimated items / items × 100            (null when 0 items)
method = "storyPoints"  iff  every item has a valid estimate AND Σ points > 0
         "workItems"    otherwise
progress(storyPoints) = Σ points(done) / Σ points(all) × 100
progress(workItems)   = done items / items × 100
0 items → progress 0, method "workItems"
```

Estimated and unestimated work are never mixed. "Done" = status category `done`; `unknown`
counts as not done.

| KPI | Input set | Provenance (description) |
|---|---|---|
| **Overall progress** | project-scope items (never an average of sprint/milestone %) | "Based on completed story points." / "Based on completed work items because story-point coverage is N%." |
| **Sprint progress** | sprint delivery items | `progressMethod` |
| **Milestone progress** | delivery items with `epicKey` = epic | `progressMethod` |

## Counts

- Work items / completed / in progress / to do: project-scope items by status category.
- **Status distribution**: Done, In Progress, To Do (+ Unknown if > 0). Blocked is *not* a
  bucket — buckets always sum to the item count.
- **Blocked work items**: unresolved items with `blocked === true` (normalized from unresolved
  "is blocked by" links or configured blocked statuses). Reported project-wide, per sprint, per
  milestone. Never re-parsed from raw links.

## Risks — `risks.ts`

Risk = any issue with normalized `riskSeverity` (all issues, not only delivery scope).
Resolved ⇔ status category `done`. Counts: `openP0`, `openP1`, `resolvedP0`, `resolvedP1`.
**Critically blocked** issue: unresolved, blocked, and (itself P0 or blocked by an open P0).
Risk list order: open first, P0 first, then register ID; `blocksWorkItems` = unresolved items
it blocks.

## Sprint health — `sprint-health.ts` (deterministic, not a forecast)

In order:
1. **future** — Jira state `future`.
2. **complete** — state `closed`, or ≥1 delivery item and all done.
3. **blocked** — any unresolved sprint issue is critically blocked.
4. **at_risk** — blocked delivery items > 0, or (active, valid dates, and
   `elapsed ≥ 90% ∧ progress < 75%` or `elapsed ≥ 75% ∧ progress < 50%`).
5. **healthy** — otherwise.

`elapsed = (now − start) / (end − start) × 100`, clamped; null (rule skipped) when dates are
missing, invalid, or end ≤ start. Each assessment returns client-friendly `reasons`.

## Milestone health — `milestone-progress.ts`

Associated open risks = unresolved P0/P1 issues that are children of the epic (incl. risk
items) or that currently block one of its unresolved children.

1. **complete** — (≥1 delivery item and all done, or no items and the epic is done in Jira)
   and no associated open P0.
2. **blocked** — associated open P0 > 0, or a child is critically blocked.
3. **at_risk** — associated open P1 > 0, or blocked delivery items > 0.
4. **healthy** — otherwise.

## Roadmap

- `migrationSprints`: names matching `MIG S<n>`, sorted by `n` (then Jira ID); `roadmapPosition = n`.
- `activeSprint`: exactly Jira's active sprint (never substituted).
- `migrationState.activeMigrationSprint`: active roadmap sprint or null.
- `migrationState.nextMigrationSprint`: first roadmap sprint not closed and not fully done
  (empty counts as not done) — may be the active one.

- `migrationState.followingMigrationSprint`: with an active migration sprint, the next roadmap
  sprint after it (null after the last); otherwise the first incomplete sprint. Non-migration
  active sprints never affect it. `nextMigrationSprint` keeps its original semantics.

## Project health — `project-health.ts`

1. **complete** — ≥1 committed milestone and all committed milestones complete.
2. **blocked** — any committed milestone blocked.
3. **at_risk** — any committed milestone at risk, or the active migration sprint blocked/at risk.
4. **healthy** — otherwise.

## Blocked work list — `blockers.ts`

`dto.blockers` = the same set as `summary.blockedWorkItems` (unresolved, project-scope, blocked),
ordered critical first, then milestone number, then key; each with readable `blockedBy`
(risk ID, title, severity). Work items in sprint DTOs carry the same `blockedBy` details and a
display `group` (done → blocked → in_progress / todo / unknown).

## Velocity & throughput — `velocity.ts` (closed migration sprints only)

No changelog: "completed in sprint" = done AND (`resolvedAt ≤ sprint.completeDate` when both
exist).
- **Velocity** per sprint: `available` iff ≥1 delivery item and all estimated;
  committed = Σ estimates; completed = Σ estimates completed in sprint. Unavailable → nulls.
  Chart `available` iff any point is. Never substitutes work-item counts.
- **Throughput** per sprint: committed / completed delivery item counts (always available).

## Workload — `workload.ts`

Project-scope, unresolved items grouped by assignee `accountId` (null → "Unassigned"):
open, in progress, blocked, `storyPointsOpen` (null if none estimated). Sorted by open desc,
Unassigned after named on ties, then name. Display names only — never emails.

## Milestone / summary totals

`totalMilestones` / `completedMilestones` count `inProjectScope` milestones; completed ⇔ health
`complete`. `completedSprints` = closed migration sprints.

## Recent activity

Requires changelog (not fetched yet) → `recentActivity: []` + `ACTIVITY_HISTORY_UNAVAILABLE`.
Never reconstruct history.

## Warnings — `warnings.ts`

`NO_STORY_POINTS_FIELD`, `STORY_POINTS_INCOMPLETE`, `NO_ACTIVE_SPRINT`,
`ACTIVE_NON_MIGRATION_SPRINT`, `NO_MIGRATION_SPRINTS`, `NO_ACTIVE_MIGRATION_SPRINT`,
`MISSING_SPRINT_DATES` (active sprint → warning; undated upcoming migration sprints → info),
`VELOCITY_UNAVAILABLE`, `ACTIVITY_HISTORY_UNAVAILABLE`. Messages use sprint names and counts
only.

## Not yet implemented (later phases)

Average issue age, stale issues, carryover, burndown, completion trend (need changelog).
