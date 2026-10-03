import type { RawChangelogItem, RawIssueChangelog } from "@/lib/jira/history-schemas";
import type { HistoryField, HistoryValue, JiraHistoryEvent } from "./types";

/**
 * Raw bulk-changelog entries → normalized JiraHistoryEvents.
 * Field identity comes from fieldId (site-specific custom fields are passed in from field
 * discovery — never hard-coded). Only display names of actors are kept.
 */

export type HistoryFieldIds = {
  sprintField: string | null;
  storyPointsField: string | null;
};

const SYSTEM_FIELDS: Record<string, HistoryField> = {
  status: "status",
  assignee: "assignee",
  priority: "priority",
  labels: "labels",
  resolution: "resolution",
};

export function classifyField(item: Pick<RawChangelogItem, "field" | "fieldId">, ids: HistoryFieldIds): HistoryField {
  const fieldId = item.fieldId ?? null;
  if (fieldId && ids.sprintField && fieldId === ids.sprintField) return "sprint";
  if (fieldId && ids.storyPointsField && fieldId === ids.storyPointsField) return "storyPoints";
  if (fieldId && SYSTEM_FIELDS[fieldId]) return SYSTEM_FIELDS[fieldId]!;
  return "other";
}

/** "1, 3" → [1, 3]. */
export function parseSprintIds(raw: string | null | undefined): number[] {
  if (!raw) return [];
  const ids = raw
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
  return [...new Set(ids)].sort((a, b) => a - b);
}

/** Story points arrive as strings ("5", "3.5"); invalid/negative → null. */
export function parseStoryPoints(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function value(field: HistoryField, id: string | null | undefined, display: string | null | undefined): HistoryValue {
  switch (field) {
    case "status":
      return { kind: "status", value: id || display ? { id: id ?? null, name: display ?? null } : null };
    case "sprint":
      return { kind: "sprint", value: parseSprintIds(id) };
    case "storyPoints":
      return { kind: "storyPoints", value: parseStoryPoints(display ?? id) };
    case "labels":
      return { kind: "labels", value: (display ?? "").split(/\s+/).filter(Boolean) };
    default:
      // assignee/priority/resolution/other: display text only (assignee IDs are not kept).
      return { kind: "text", value: display ?? null };
  }
}

/** Jira bulk changelog `created` is epoch ms (number) or ISO text. */
export function normalizeInstant(raw: string | number): string | null {
  const ms = typeof raw === "number" ? raw : Number.isNaN(Number(raw)) ? Date.parse(raw) : Number(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function normalizeChangelogs(
  raw: readonly RawIssueChangelog[],
  issueKeyById: ReadonlyMap<string, string>,
  ids: HistoryFieldIds,
): JiraHistoryEvent[] {
  const events: JiraHistoryEvent[] = [];
  for (const log of raw) {
    const issueKey = issueKeyById.get(log.issueId);
    if (!issueKey) continue; // not in the tracked scope
    for (const history of log.changeHistories) {
      const timestamp = normalizeInstant(history.created);
      if (!timestamp) continue;
      const displayName = history.author?.displayName?.trim();
      history.items.forEach((item, index) => {
        const field = classifyField(item, ids);
        events.push({
          id: `${history.id}:${index}`,
          issueId: log.issueId,
          issueKey,
          timestamp,
          field,
          from: value(field, item.from, item.fromString),
          to: value(field, item.to, item.toString),
          actor: displayName ? { displayName } : null,
        });
      });
    }
  }
  return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id, "en", { numeric: true }));
}
