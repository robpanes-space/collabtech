import { buildTimelines, type PreparedTimeline } from "@/lib/history/issue-timeline";
import type { HistoryContext } from "@/lib/history/sprint-history";
import type { HistoryValue, JiraHistoryEvent, StatusCategoryCatalog } from "@/lib/history/types";
import type { DashboardIssue, StatusCategory } from "@/lib/jira/types";
import { issue as baseIssue } from "../dashboard/helpers";

/** Status IDs used in history tests. */
export const S = { todo: "1", progress: "3", review: "4", done: "5" } as const;
export const CATALOG: StatusCategoryCatalog = new Map<string, StatusCategory>([
  ["1", "todo"],
  ["3", "in_progress"],
  ["4", "in_progress"],
  ["5", "done"],
]);

let seq = 0;

/** A delivery work item as it is NOW (anchor for reconstruction). */
export function workItem(input: {
  key: string;
  created: string;
  status?: keyof typeof S;
  sprintIds?: number[];
  points?: number | null;
  summary?: string;
  risk?: "P0" | "P1";
}): DashboardIssue {
  const statusKey = input.status ?? "todo";
  const category = CATALOG.get(S[statusKey])!;
  const base = baseIssue({ key: input.key, summary: input.summary ?? (input.risk ? `I-0${++seq % 9} ${input.risk} - Risk ${input.key}` : `Item ${input.key}`) });
  return {
    ...base,
    id: `id-${input.key}`,
    createdAt: new Date(input.created).toISOString(),
    status: { id: S[statusKey], name: statusKey, category },
    sprintIds: input.sprintIds ?? [],
    storyPoints: input.points ?? null,
  };
}

const status = (id: string | null): HistoryValue => ({ kind: "status", value: id ? { id, name: id } : null });
const sprints = (ids: number[]): HistoryValue => ({ kind: "sprint", value: ids });
const points = (value: number | null): HistoryValue => ({ kind: "storyPoints", value });
const text = (value: string | null): HistoryValue => ({ kind: "text", value });

function event(key: string, at: string, field: JiraHistoryEvent["field"], from: HistoryValue, to: HistoryValue): JiraHistoryEvent {
  return {
    id: `${++seq}:0`,
    issueId: `id-${key}`,
    issueKey: key,
    timestamp: new Date(at).toISOString(),
    field,
    from,
    to,
    actor: { displayName: "Alex Rivera" },
  };
}

export const ev = {
  status: (key: string, at: string, from: keyof typeof S, to: keyof typeof S) => event(key, at, "status", status(S[from]), status(S[to])),
  sprint: (key: string, at: string, from: number[], to: number[]) => event(key, at, "sprint", sprints(from), sprints(to)),
  points: (key: string, at: string, from: number | null, to: number | null) => event(key, at, "storyPoints", points(from), points(to)),
  assignee: (key: string, at: string, to: string | null) => event(key, at, "assignee", text(null), text(to)),
  priority: (key: string, at: string, from: string, to: string) => event(key, at, "priority", text(from), text(to)),
  other: (key: string, at: string) => event(key, at, "other", text(null), text("x")),
  labels: (key: string, at: string) => event(key, at, "labels", { kind: "labels", value: [] }, { kind: "labels", value: ["a"] }),
};

export function timelines(items: DashboardIssue[], events: JiraHistoryEvent[]): PreparedTimeline[] {
  return [...buildTimelines(items, events).values()];
}

export const ctx = (now: string, timeZone = "UTC", sprintFieldKnown = true): HistoryContext => ({
  now: new Date(now),
  timeZone,
  catalog: CATALOG,
  sprintFieldKnown,
});
