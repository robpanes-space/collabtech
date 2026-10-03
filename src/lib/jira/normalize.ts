import { summarizeWork } from "@/lib/dashboard/work-progress";
import type {
  RawJiraBoard,
  RawJiraIssue,
  RawJiraProject,
  RawJiraSprint,
} from "./schemas";
import type {
  DashboardIssue,
  JiraBoard,
  JiraProject,
  JiraSprint,
  NormalizedMilestone,
  NormalizedProjectData,
  NormalizedSprint,
  RiskSeverity,
  RiskSeveritySource,
  StatusCategory,
} from "./types";

/**
 * Raw Jira → domain model. Pure functions only: no I/O, no clock (pass `now`).
 * Rules are documented in .claude/skills/jira-api/SKILL.md ("Normalization").
 */

export type NormalizeOptions = {
  /** Story points custom field ID resolved by resolveStoryPointsField(). */
  storyPointsField: string | null;
  /** Optional custom field holding P0/P1 risk severity (highest precedence). */
  riskField?: string | null;
  /** Legacy "Epic Link" custom field; used only when no `parent` is present. */
  epicLinkField?: string | null;
  /** Status names (case-insensitive) that mean "blocked" in addition to blocker links. */
  blockedStatusNames?: readonly string[];
  /** Sprint naming convention for the migration roadmap; group 1 = sprint number. */
  migrationSprintPattern?: RegExp;
  /** Discovered Sprint custom field ID (array of sprint objects on each issue). */
  sprintField?: string | null;
};

/** Sprint IDs from the Sprint field value (array of {id}); null when the field is absent. */
export function normalizeSprintIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value
    .map((sprint) => (sprint && typeof sprint === "object" ? (sprint as { id?: unknown }).id : undefined))
    .filter((id): id is number => typeof id === "number" && Number.isInteger(id));
  return [...new Set(ids)].sort((a, b) => a - b);
}

export const DEFAULT_MIGRATION_SPRINT_PATTERN = /^\s*MIG\s+S(\d{1,3})\b/i;
const MILESTONE_NUMBER_PATTERN = /^\s*M(\d{1,2})\b/;

// ---------------------------------------------------------------------------
// Primitive normalizers
// ---------------------------------------------------------------------------

/** Jira status category is authoritative; status names are never interpreted. */
export function normalizeStatus(categoryKey: string | null | undefined): StatusCategory {
  switch (categoryKey) {
    case "new":
      return "todo";
    case "indeterminate":
      return "in_progress";
    case "done":
      return "done";
    default:
      return "unknown";
  }
}

/** Finite, non-negative numbers only. Strings (even "8") are rejected as non-Jira-native. */
export function normalizeStoryPoints(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Any parseable timestamp → UTC ISO string; otherwise null. */
export function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** Calendar date `YYYY-MM-DD` kept as-is (converting to a timestamp would shift time zones). */
export function normalizeDateOnly(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

// ---------------------------------------------------------------------------
// Risk severity
// ---------------------------------------------------------------------------

const SEVERITY_TOKEN = /^\s*(P[01])\b/i;
const RISK_LABELS: Record<string, "P0" | "P1"> = {
  p0: "P0",
  "priority-p0": "P0",
  "risk-p0": "P0",
  p1: "P1",
  "priority-p1": "P1",
  "risk-p1": "P1",
};
/** "I-01 P0 - Tenant Metadata Absent": short ID prefix, whitespace, standalone P0/P1. */
const RISK_SUMMARY_PATTERN = /^\s*([A-Z]{1,4}-\d{1,4})\s+(P[01])\b/i;

/** Risk-register ID ("I-01") when the summary follows the register convention. */
export function riskRegisterId(summary: string | null | undefined): string | null {
  const match = summary ? RISK_SUMMARY_PATTERN.exec(summary) : null;
  return match?.[1] ? match[1].toUpperCase() : null;
}

function severityFromText(text: string | null | undefined): RiskSeverity {
  const match = text ? SEVERITY_TOKEN.exec(text) : null;
  return match?.[1] ? (match[1].toUpperCase() as "P0" | "P1") : null;
}

/** Custom field values may be a string, a select option `{value}`, or an array of either. */
function severityFromFieldValue(value: unknown): RiskSeverity {
  const values = Array.isArray(value) ? value : [value];
  let best: RiskSeverity = null;
  for (const item of values) {
    let text: string | null = null;
    if (typeof item === "string") text = item;
    else if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const candidate = record.value ?? record.name;
      if (typeof candidate === "string") text = candidate;
    }
    const severity = severityFromText(text);
    if (severity === "P0") return "P0";
    best ??= severity;
  }
  return best;
}

function severityFromLabels(labels: readonly string[]): RiskSeverity {
  const found = labels.map((label) => RISK_LABELS[label.trim().toLowerCase()]).filter(Boolean);
  if (found.includes("P0")) return "P0";
  return found.includes("P1") ? "P1" : null;
}

export function normalizeRiskSeverity(input: {
  riskFieldValue?: unknown;
  priorityName?: string | null;
  labels?: readonly string[];
  summary?: string | null;
}): { severity: RiskSeverity; source: RiskSeveritySource } {
  const fromField = severityFromFieldValue(input.riskFieldValue);
  if (fromField) return { severity: fromField, source: "riskField" };

  const fromPriority = severityFromText(input.priorityName);
  if (fromPriority) return { severity: fromPriority, source: "priority" };

  const fromLabels = severityFromLabels(input.labels ?? []);
  if (fromLabels) return { severity: fromLabels, source: "label" };

  const summaryMatch = input.summary ? RISK_SUMMARY_PATTERN.exec(input.summary) : null;
  if (summaryMatch?.[2]) {
    return { severity: summaryMatch[2].toUpperCase() as "P0" | "P1", source: "summary" };
  }
  return { severity: null, source: null };
}

// ---------------------------------------------------------------------------
// Blockers
// ---------------------------------------------------------------------------

type RawIssueLink = NonNullable<RawJiraIssue["fields"]["issuelinks"]>[number];

function isBlockerLinkType(type: RawIssueLink["type"]): boolean {
  return /^blocks?$/i.test(type.name.trim()) || /\bblocked by\b/i.test(type.inward);
}

/**
 * Returns keys of unresolved issues blocking this one.
 * On issue X, a "Blocks" link with `inwardIssue: Y` reads "X is blocked by Y".
 * A link with `outwardIssue: Z` reads "X blocks Z" and does not block X.
 * Blockers whose own status category is "done" no longer block.
 */
export function normalizeIssueLinks(links: readonly RawIssueLink[] | null | undefined): string[] {
  const blockers: string[] = [];
  for (const link of links ?? []) {
    if (!isBlockerLinkType(link.type) || !link.inwardIssue) continue;
    const blocker = link.inwardIssue;
    const category = blocker.fields?.status?.statusCategory?.key;
    if (normalizeStatus(category) === "done") continue;
    if (!blockers.includes(blocker.key)) blockers.push(blocker.key);
  }
  return blockers;
}

// ---------------------------------------------------------------------------
// Issue
// ---------------------------------------------------------------------------

function isEpicType(issueType: { name: string; hierarchyLevel?: number | null } | null | undefined) {
  if (!issueType) return false;
  if (typeof issueType.hierarchyLevel === "number") return issueType.hierarchyLevel === 1;
  return issueType.name.trim().toLowerCase() === "epic";
}

function normalizeHierarchy(
  fields: RawJiraIssue["fields"],
  epicLinkField: string | null | undefined,
): { parentKey: string | null; epicKey: string | null } {
  const parent = fields.parent;
  if (parent) {
    // Modern `parent` wins over legacy Epic Link. Unknown parent type → plain parent.
    return isEpicType(parent.fields?.issuetype)
      ? { parentKey: null, epicKey: parent.key }
      : { parentKey: parent.key, epicKey: null };
  }
  if (epicLinkField) {
    const legacy = fields[epicLinkField];
    if (typeof legacy === "string" && /^[A-Z][A-Z0-9_]*-\d+$/.test(legacy)) {
      return { parentKey: null, epicKey: legacy };
    }
  }
  return { parentKey: null, epicKey: null };
}

export function normalizeIssue(raw: RawJiraIssue, options: NormalizeOptions): DashboardIssue {
  const { fields } = raw;
  const labels = (fields.labels ?? []).filter((label) => typeof label === "string");
  const statusName = fields.status.name;
  // Status-based blocking: exact (case-insensitive, trimmed) match against JIRA_BLOCKED_STATUSES.
  // Done always wins: an issue whose status category is done is never "blocked by status".
  const blockedStatusNames = (options.blockedStatusNames ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean);
  const blockedByStatus =
    normalizeStatus(fields.status.statusCategory?.key) !== "done" &&
    blockedStatusNames.includes(statusName.trim().toLowerCase());
  const blockers = normalizeIssueLinks(fields.issuelinks);
  const risk = normalizeRiskSeverity({
    riskFieldValue: options.riskField ? fields[options.riskField] : undefined,
    priorityName: fields.priority?.name,
    labels,
    summary: fields.summary,
  });
  const hierarchyLevel = fields.issuetype.hierarchyLevel ?? null;

  return {
    id: raw.id,
    key: raw.key,
    summary: fields.summary,
    issueType: { id: fields.issuetype.id ?? null, name: fields.issuetype.name, hierarchyLevel },
    isEpic: isEpicType(fields.issuetype),
    isSubtask: fields.issuetype.subtask === true || hierarchyLevel === -1,
    status: {
      id: fields.status.id ?? null,
      name: statusName,
      category: normalizeStatus(fields.status.statusCategory?.key),
    },
    assignee: fields.assignee
      ? {
          accountId: fields.assignee.accountId,
          displayName: fields.assignee.displayName?.trim() || "Unknown user",
          active: fields.assignee.active ?? null,
        }
      : null,
    priority: fields.priority ? { id: fields.priority.id ?? null, name: fields.priority.name } : null,
    storyPoints: options.storyPointsField ? normalizeStoryPoints(fields[options.storyPointsField]) : null,
    ...normalizeHierarchy(fields, options.epicLinkField),
    labels,
    createdAt: normalizeTimestamp(fields.created),
    updatedAt: normalizeTimestamp(fields.updated),
    resolvedAt: normalizeTimestamp(fields.resolutiondate),
    dueDate: normalizeDateOnly(fields.duedate),
    blockers,
    blocked: blockers.length > 0 || blockedByStatus,
    blockedByStatus,
    riskSeverity: risk.severity,
    riskSeveritySource: risk.source,
    riskRegisterId: riskRegisterId(fields.summary),
    sprintId: fields.sprint?.id ?? null,
    sprintIds: (options.sprintField ? normalizeSprintIds(fields[options.sprintField]) : null) ?? [],
  };
}

// ---------------------------------------------------------------------------
// Sprint
// ---------------------------------------------------------------------------

export function normalizeSprintInfo(raw: RawJiraSprint): JiraSprint {
  return {
    id: raw.id,
    name: raw.name,
    state: raw.state,
    goal: raw.goal?.trim() || null,
    startDate: normalizeTimestamp(raw.startDate),
    endDate: normalizeTimestamp(raw.endDate),
    completeDate: normalizeTimestamp(raw.completeDate),
  };
}

export function migrationSprintNumber(
  name: string,
  pattern: RegExp = DEFAULT_MIGRATION_SPRINT_PATTERN,
): number | null {
  const match = pattern.exec(name);
  return match?.[1] ? Number(match[1]) : null;
}

export function normalizeSprint(
  raw: RawJiraSprint,
  issues: DashboardIssue[],
  options: Pick<NormalizeOptions, "migrationSprintPattern"> = {},
): NormalizedSprint {
  return {
    ...normalizeSprintInfo(raw),
    issues,
    ...summarizeWork(issues),
    migrationSprintNumber: migrationSprintNumber(raw.name, options.migrationSprintPattern),
  };
}

// ---------------------------------------------------------------------------
// Milestone (Epic)
// ---------------------------------------------------------------------------

export function milestoneNumber(summary: string): number | null {
  const match = MILESTONE_NUMBER_PATTERN.exec(summary);
  return match?.[1] ? Number(match[1]) : null;
}

/** Children are issues whose direct `epicKey` is this epic. */
export function normalizeMilestone(epic: DashboardIssue, allIssues: DashboardIssue[]): NormalizedMilestone {
  const childIssues = allIssues.filter((issue) => issue.epicKey === epic.key);
  const summary = summarizeWork(childIssues);
  const openRisks = childIssues.filter((issue) => issue.status.category !== "done");

  return {
    key: epic.key,
    summary: epic.summary,
    status: epic.status,
    milestoneNumber: milestoneNumber(epic.summary),
    childIssues,
    ...summary,
    totalWorkItems: summary.totalIssues,
    completedWorkItems: summary.completedIssues,
    blockedWorkItems: summary.blockedIssues,
    riskCounts: {
      p0: openRisks.filter((issue) => issue.riskSeverity === "P0").length,
      p1: openRisks.filter((issue) => issue.riskSeverity === "P1").length,
    },
  };
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

const compareKeys = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

export type RawProjectInput = {
  project: RawJiraProject;
  board: RawJiraBoard;
  /** Board sprints in Jira's order. */
  sprints: RawJiraSprint[];
  /** Issues per sprint ID from the Agile sprint-issue endpoint. */
  sprintIssues: Readonly<Record<number, RawJiraIssue[]>>;
  /** All project issues (epics, stories, tasks, risks), e.g. from /search/jql. */
  projectIssues: RawJiraIssue[];
};

export function normalizeProjectData(
  input: RawProjectInput,
  options: NormalizeOptions,
  now: Date,
): NormalizedProjectData {
  // Merge issue sources by key. Project search is the primary record; the Agile sprint
  // payload fills in issues missing from search and supplies the `sprint` field.
  // Current sprint: the Agile `sprint` field when present; otherwise sprint-endpoint
  // membership, preferring active > future > closed (an issue's current sprint is never
  // a closed one while it also sits in an open sprint).
  const rawByKey = new Map<string, RawJiraIssue>();
  const sprintIdByKey = new Map<string, number>();
  const membershipByKey = new Map<string, { id: number; rank: number }>();
  const allMembershipByKey = new Map<string, Set<number>>();
  const stateRank = { active: 0, future: 1, closed: 2 } as const;
  const sprintById = new Map(input.sprints.map((sprint) => [sprint.id, sprint]));
  for (const raw of input.projectIssues) rawByKey.set(raw.key, raw);
  for (const [sprintIdText, sprintRaws] of Object.entries(input.sprintIssues)) {
    const sprintId = Number(sprintIdText);
    const rank = stateRank[sprintById.get(sprintId)?.state ?? "closed"];
    for (const raw of sprintRaws) {
      if (!rawByKey.has(raw.key)) rawByKey.set(raw.key, raw);
      if (raw.fields.sprint?.id !== undefined) sprintIdByKey.set(raw.key, raw.fields.sprint.id);
      allMembershipByKey.set(raw.key, (allMembershipByKey.get(raw.key) ?? new Set()).add(sprintId));
      const current = membershipByKey.get(raw.key);
      if (!current || rank < current.rank) membershipByKey.set(raw.key, { id: sprintId, rank });
    }
  }

  const issueByKey = new Map<string, DashboardIssue>();
  for (const [key, raw] of rawByKey) {
    const issue = normalizeIssue(raw, options);
    const sprintId = issue.sprintId ?? sprintIdByKey.get(key) ?? membershipByKey.get(key)?.id ?? null;
    const fieldIds = options.sprintField ? normalizeSprintIds(raw.fields[options.sprintField]) : null;
    const sprintIds = fieldIds ?? [...(allMembershipByKey.get(key) ?? [])].sort((a, b) => a - b);
    issueByKey.set(key, { ...issue, sprintId, sprintIds });
  }
  const issues = [...issueByKey.values()];

  const sprints = input.sprints.map((rawSprint) => {
    const keys = (input.sprintIssues[rawSprint.id] ?? []).map((raw) => raw.key);
    const sprintIssues = [...new Set(keys)]
      .map((key) => issueByKey.get(key))
      .filter((issue): issue is DashboardIssue => issue !== undefined);
    return normalizeSprint(rawSprint, sprintIssues, options);
  });

  const activeSprints = sprints.filter((sprint) => sprint.state === "active");

  const migrationSprints = sprints
    .filter((sprint) => sprint.migrationSprintNumber !== null)
    .sort((a, b) => (a.migrationSprintNumber ?? 0) - (b.migrationSprintNumber ?? 0) || a.id - b.id);

  const milestones = issues
    .filter((issue) => issue.isEpic)
    .map((epic) => normalizeMilestone(epic, issues))
    .sort(
      (a, b) =>
        (a.milestoneNumber ?? Number.POSITIVE_INFINITY) - (b.milestoneNumber ?? Number.POSITIVE_INFINITY) ||
        compareKeys(a.key, b.key),
    );

  const severityRank = { P0: 0, P1: 1 } as const;
  const risks = issues
    .filter((issue) => issue.riskSeverity !== null)
    .sort(
      (a, b) =>
        severityRank[a.riskSeverity ?? "P1"] - severityRank[b.riskSeverity ?? "P1"] ||
        compareKeys(a.summary, b.summary) ||
        compareKeys(a.key, b.key),
    );

  const project: JiraProject = { id: input.project.id, key: input.project.key, name: input.project.name };
  const board: JiraBoard = { id: input.board.id, name: input.board.name, type: input.board.type };

  return {
    project,
    board,
    activeSprint: activeSprints[0] ?? null,
    activeSprints,
    sprints,
    migrationSprints,
    milestones,
    issues,
    risks,
    metadata: {
      storyPointsField: options.storyPointsField,
      sprintField: options.sprintField ?? null,
      normalizedAt: now.toISOString(),
    },
  };
}
