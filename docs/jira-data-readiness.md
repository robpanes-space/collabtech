# Jira data readiness

The dashboard reports exactly what Jira contains. When Jira data is incomplete or
inconsistent, the dashboard **surfaces it** instead of compensating in its calculations. The
readiness engine (`src/lib/readiness/`) turns that into a checklist for the operator.

- Admin view: **`/admin/readiness`** (signed in; limited to `DASHBOARD_ADMIN_EMAILS` when set)
- API: **`GET /api/jira/readiness`** (same access; 401 signed out, 403 not an admin)
- Read-only: the dashboard never changes Jira. Make the recommended change in Jira; it shows
  up within a few minutes (readiness cache 60 s, history cache 300 s).

## Overall status (deterministic, no score)

| Status | Rule |
|---|---|
| **Blocked** | a *critical* check fails (e.g. no migration sprint while delivery is underway, sign-in misconfigured) |
| **Attention** | any critical/important check warns, or an important check fails |
| **Ready** | otherwise |

Informational checks never change the overall status. No percentage score is shown — a
weighted number would look precise without adding information.

## Data confidence (client-safe)

Clients see one line — `Data confidence: Good | Limited | Low` — on the Overview and report:

| Level | Rule |
|---|---|
| Low | a data check fails (current sprint has no dates; no migration sprint in progress while delivery should be underway) |
| Limited | a data check warns (sprint schedule, estimates, milestone assignment, unused open sprint, history consistency, story-point / Sprint field) |
| Good | otherwise |

Risk and blocker checks and app configuration are excluded on purpose: data confidence answers
"is the data complete?", not "is delivery on track?". Implementation:
`src/lib/readiness/data-confidence.ts`.

## Checks

| Section | Check | Pass / warning / fail |
|---|---|---|
| Jira configuration | Story-point field | found / not found |
| | Sprint history field | found / not found (no sprint-membership history) |
| | Blocked status detection | configured names exist / a configured name is not in the workflow (important) / the workflow has a status named exactly "Blocked" that is not configured (informational) |
| Sprint planning | Active migration sprint (critical) | exactly one / several / none while delivery is expected (a sprint closed or a start date passed); n/a before any sprint starts. Unrelated active sprints never count. |
| | Empty active sprints | none / an active sprint has no issues (e.g. a leftover setup sprint) |
| | Sprint dates | all `MIG` sprints have start < end / upcoming sprints missing dates / the active sprint missing dates (fail). Reports "N of M migration sprints scheduled". |
| Estimation | Story-point coverage | 100% (progress uses story points) / below 100% (progress uses work items — a valid fallback, never a fail) |
| Work classification | Milestone assignment | every committed work item belongs to an M1–M8 epic / some committed items have no milestone (listed) |
| | Excluded work (info) | lists items excluded by `exclude-from-progress` / `project-control` |
| Risks & blockers | Open P0 risks (critical) | none / open P0 risks (Attention — never hidden) |
| | Open P1 risks, Blocked work (info) | counts; blocked work split into by-link, by-status and unique total |
| Historical analytics | Jira change history | loaded / unavailable |
| | History matches current Jira | reconstructed final status, sprint membership and story points equal today's Jira values / mismatches (counts) |
| | Sprint history (info) | e.g. "1 available (1 high confidence), 7 awaiting sprint execution" — sprints that have not run are never "bad history" |
| | Current sprint burndown | available / waiting for start (n/a) / missing dates or low confidence (warning) |
| | Throughput, project trend (info) | available / "appears after work items begin reaching Done" / "requires at least two days of history" |
| Client dashboard | Client sign-in (critical), display time zone, Jira links (info) | configuration status |

Per-sprint burndown readiness is listed as `available`, `waiting_for_start`,
`missing_dates`, `insufficient_history` or `low_confidence` (from the history engine).

Security items that cannot be verified at runtime stay in `client-launch-checklist.md` — the
app never shows a "pass" it cannot prove.

## Recommended Jira conventions

These conventions are how the dashboard **classifies** data. Where Jira has a real
relationship (parent epic, sprint membership, issue links, status category), that
relationship is authoritative — names are only used where no relationship exists.

| Convention | Used for |
|---|---|
| Sprint name `MIG S<number> - <name>` | migration roadmap order and "migration sprint" classification |
| Epic name `M<number> - <name>` | milestone number/label (the epic itself comes from the `parent` relationship) |
| `M9` epic | optional scope — excluded from committed progress until its work enters a sprint or starts |
| Labels `p0`, `p1` (or `priority-p0`, `risk-p1`…) and summaries `I-01 P0 - …` | risk severity (after a configured risk field and P0/P1 priorities) |
| Label `exclude-from-progress` | remove a work item from progress (e.g. sample/test items) |
| Label `project-control` | remove project-control/governance work (e.g. acceptance criteria) from delivery progress |
| `JIRA_BLOCKED_STATUSES=Blocked` | treat work in that status as blocked (in addition to "is blocked by" links) |
| Sprint start/end dates | burndown days, sprint health time rule, roadmap schedule |
| Story point estimates on every committed story | progress switches to story points automatically at 100% coverage |

## Blocker rule

An open work item is blocked when it has an unresolved "is blocked by" link **or** its status
name is in `JIRA_BLOCKED_STATUSES` (exact, trimmed, case-insensitive). An item matching both is
counted once. Done always wins: done-category items are never counted as blocked work.
