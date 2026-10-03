import type { StatusCategory } from "@/lib/jira/types";
import type { PreparedTimeline } from "./issue-timeline";
import type { ActivityType, HistoryActivityDto, JiraHistoryEvent, StatusCategoryCatalog } from "./types";

/**
 * Recent activity: meaningful, client-facing changes only, newest first.
 *
 *   status  todo → in progress          "started"
 *           not done → done             "completed"  (risks: "risk_resolved")
 *           done → not done             "reopened"   (risks: "risk_reopened")
 *           (moves within a category, e.g. To Do → To Do or In Progress → In Review, are noise)
 *   sprint  one event per sprint added / removed
 *   assignee / story points / priority changes
 *   Everything else (links, ranks, descriptions, labels…) is dropped.
 *   Sprint-planning batches — the same person adding/removing work items to/from the same sprint
 *   within 15 minutes — are grouped into one event ("6 work items added to MIG S2").
 * Actors are display names only ("Jira user" when unknown) — never emails or account IDs.
 */
export const ACTIVITY_WINDOW_DAYS = 30;
export const ACTIVITY_LIMIT = 20;
export const SPRINT_BATCH_WINDOW_MS = 15 * 60 * 1000;

type Draft = HistoryActivityDto & { groupKey: string | null; sprintName: string | null };

export type ActivityContext = {
  now: Date;
  catalog: StatusCategoryCatalog;
  sprintNameById: ReadonlyMap<number, string>;
  issueUrl: (key: string) => string | null;
};

function category(event: JiraHistoryEvent, side: "from" | "to", catalog: StatusCategoryCatalog): StatusCategory | null {
  const value = event[side];
  if (value.kind !== "status" || !value.value) return null;
  return (value.value.id && catalog.get(value.value.id)) || "unknown";
}

const pointsText = (value: number | null) => (value === null ? "none" : String(value));

export function buildRecentActivity(timelines: readonly PreparedTimeline[], ctx: ActivityContext): HistoryActivityDto[] {
  const since = ctx.now.getTime() - ACTIVITY_WINDOW_DAYS * 86_400_000;
  const items: Draft[] = [];

  for (const timeline of timelines) {
    const { issue } = timeline;
    const isRisk = issue.riskSeverity !== null;
    for (const event of timeline.events) {
      const at = Date.parse(event.timestamp);
      if (at < since || at > ctx.now.getTime()) continue;

      const make = (type: ActivityType, title: string, description: string | null, suffix = "", sprintName: string | null = null): Draft => ({
        id: `${event.id}${suffix}`,
        timestamp: event.timestamp,
        issueKey: issue.key,
        issueSummary: issue.summary,
        type,
        title,
        description,
        actorDisplayName: event.actor?.displayName ?? "Jira user",
        jiraUrl: ctx.issueUrl(issue.key),
        issueKeys: [issue.key],
        groupKey: sprintName ? `${type}|${sprintName}|${event.actor?.displayName ?? ""}` : null,
        sprintName,
      });

      switch (event.field) {
        case "status": {
          const from = category(event, "from", ctx.catalog);
          const to = category(event, "to", ctx.catalog);
          if (from === to || to === null) break;
          const label = isRisk && issue.riskSeverity ? `${issue.riskSeverity} risk ${issue.riskRegisterId ?? issue.key}` : issue.key;
          if (to === "done") items.push(make(isRisk ? "risk_resolved" : "completed", `${label} ${isRisk ? "resolved" : "completed"}`, null));
          else if (from === "done") items.push(make(isRisk ? "risk_reopened" : "reopened", `${label} reopened`, null));
          else if (from === "todo" && to === "in_progress") items.push(make("started", `${issue.key} moved to In Progress`, null));
          break;
        }
        case "sprint": {
          if (event.from.kind !== "sprint" || event.to.kind !== "sprint") break;
          const before = new Set(event.from.value);
          const after = new Set(event.to.value);
          const name = (id: number) => ctx.sprintNameById.get(id) ?? "a sprint";
          for (const id of after) {
            if (!before.has(id)) items.push(make("sprint_added", `${issue.key} added to ${name(id)}`, null, `:+${id}`, name(id)));
          }
          for (const id of before) {
            if (!after.has(id)) items.push(make("sprint_removed", `${issue.key} removed from ${name(id)}`, null, `:-${id}`, name(id)));
          }
          break;
        }
        case "assignee": {
          const to = event.to.kind === "text" ? event.to.value : null;
          items.push(make("assignee_changed", `${issue.key} ${to ? `assigned to ${to}` : "unassigned"}`, null));
          break;
        }
        case "storyPoints": {
          if (event.from.kind !== "storyPoints" || event.to.kind !== "storyPoints" || event.from.value === event.to.value) break;
          items.push(
            make("estimate_changed", `${issue.key} estimate changed`, `${pointsText(event.from.value)} → ${pointsText(event.to.value)} story points`),
          );
          break;
        }
        case "priority": {
          const from = event.from.kind === "text" ? event.from.value : null;
          const to = event.to.kind === "text" ? event.to.value : null;
          if (from === to) break;
          items.push(make("priority_changed", `${issue.key} priority changed`, `${from ?? "None"} → ${to ?? "None"}`));
          break;
        }
        default:
          break;
      }
    }
  }

  const sorted = items.sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.id.localeCompare(a.id, "en", { numeric: true }));
  return groupSprintBatches(sorted).slice(0, ACTIVITY_LIMIT);
}

function toDto(draft: Draft): HistoryActivityDto {
  const { groupKey, sprintName, ...dto } = draft;
  void groupKey;
  void sprintName;
  return dto;
}

/** Folds sprint-planning batches (input newest first) into single events. */
function groupSprintBatches(sorted: Draft[]): HistoryActivityDto[] {
  const groups: { head: Draft; members: Draft[] }[] = [];
  for (const item of sorted) {
    const last = groups.at(-1);
    const oldest = last?.members.at(-1);
    if (
      last &&
      oldest &&
      item.groupKey !== null &&
      item.groupKey === last.head.groupKey &&
      Date.parse(oldest.timestamp) - Date.parse(item.timestamp) <= SPRINT_BATCH_WINDOW_MS
    ) {
      last.members.push(item);
    } else {
      groups.push({ head: item, members: [item] });
    }
  }
  return groups.map(({ head, members }) => {
    const { sprintName } = head;
    const dto = toDto(head);
    if (members.length === 1) return dto;
    const keys = members.map((m) => m.issueKey).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    const verb = head.type === "sprint_added" ? "added to" : "removed from";
    return {
      ...dto,
      id: `${head.id}+${members.length - 1}`,
      title: `${members.length} work items ${verb} ${sprintName}`,
      issueSummary: keys.join(", "),
      description: null,
      jiraUrl: null,
      issueKeys: keys,
    };
  });
}
