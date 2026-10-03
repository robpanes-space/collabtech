/**
 * Normalized domain types. These — not raw Jira shapes — flow into the dashboard layer.
 * Missing values are `null`; timestamps are UTC ISO strings so objects stay serializable.
 */

export type SprintState = "active" | "future" | "closed";

export type StatusCategory = "todo" | "in_progress" | "done" | "unknown";

export type RiskSeverity = "P0" | "P1" | null;

/** Which evidence produced a risk severity (precedence order). */
export type RiskSeveritySource = "riskField" | "priority" | "label" | "summary" | null;

export type ProgressMethod = "storyPoints" | "workItems";

export type JiraProject = {
  id: string;
  key: string;
  name: string;
};

export type JiraBoard = {
  id: number;
  name: string;
  type: string;
};

export type JiraSprint = {
  id: number;
  name: string;
  state: SprintState;
  goal: string | null;
  startDate: string | null;
  endDate: string | null;
  completeDate: string | null;
};

export type DashboardIssue = {
  id: string;
  key: string;
  summary: string;

  issueType: {
    id: string | null;
    name: string;
    /** Jira hierarchy: 1 = epic, 0 = standard work, -1 = subtask. */
    hierarchyLevel: number | null;
  };
  isEpic: boolean;
  isSubtask: boolean;

  status: {
    id: string | null;
    name: string;
    category: StatusCategory;
  };

  assignee: { accountId: string | null; displayName: string; active: boolean | null } | null;
  priority: { id: string | null; name: string } | null;

  storyPoints: number | null;

  /** Non-epic parent (e.g. a subtask's story). */
  parentKey: string | null;
  /** Epic (client-facing milestone) this issue belongs to directly. */
  epicKey: string | null;

  labels: string[];

  createdAt: string | null;
  updatedAt: string | null;
  resolvedAt: string | null;
  /** Calendar date `YYYY-MM-DD` (Jira due dates have no time component). */
  dueDate: string | null;

  /** Keys of unresolved issues that block this one. */
  blockers: string[];
  blocked: boolean;
  /** True when a configured "blocked" status name matched (independent of links). */
  blockedByStatus: boolean;

  riskSeverity: RiskSeverity;
  riskSeveritySource: RiskSeveritySource;
  /** Risk-register ID from the summary convention ("I-01 P0 - …" → "I-01"), else null. */
  riskRegisterId: string | null;

  /** Sprint the Jira Agile API reports for this issue, if any. */
  sprintId: number | null;
  /**
   * Every sprint the issue currently belongs to (Jira's Sprint field keeps closed sprints too),
   * ascending. Anchor for reconstructing sprint membership history.
   */
  sprintIds: number[];
};

/** Aggregate of a set of work items — produced by src/lib/dashboard/work-progress.ts. */
export type WorkSummary = {
  totalIssues: number;
  completedIssues: number;
  inProgressIssues: number;
  todoIssues: number;
  unknownIssues: number;
  /** Unresolved work items that are blocked. */
  blockedIssues: number;

  /** Sum over estimated work items; null when none are estimated. */
  storyPointsTotal: number | null;
  storyPointsCompleted: number | null;

  estimatedIssueCount: number;
  unestimatedIssueCount: number;
  /** estimated / total work items × 100; null when there are no work items. */
  estimationCoverage: number | null;

  /** 0–100, unrounded. 0 when there are no work items. */
  progress: number;
  progressMethod: ProgressMethod;
};

export type NormalizedSprint = JiraSprint &
  WorkSummary & {
    /** All issues Jira reports in the sprint, including epics/subtasks. */
    issues: DashboardIssue[];
    /** Present when the name matches the migration convention (e.g. "MIG S3 - ..."). */
    migrationSprintNumber: number | null;
  };

export type NormalizedMilestone = WorkSummary & {
  key: string;
  summary: string;
  status: DashboardIssue["status"];
  /** Parsed from an "M<n>" title prefix; metadata only — Jira owns the epic. */
  milestoneNumber: number | null;
  childIssues: DashboardIssue[];
  /** Same as totalIssues/completedIssues/blockedIssues; client-facing names. */
  totalWorkItems: number;
  completedWorkItems: number;
  blockedWorkItems: number;
  /** Unresolved children with P0/P1 severity. */
  riskCounts: { p0: number; p1: number };
};

export type NormalizedProjectData = {
  project: JiraProject;
  board: JiraBoard;
  /** Exactly what Jira reports as active (first, if several). Never overridden. */
  activeSprint: NormalizedSprint | null;
  activeSprints: NormalizedSprint[];
  /** All board sprints in Jira's order. */
  sprints: NormalizedSprint[];
  /** Sprints matching the migration naming convention, ordered by sprint number. */
  migrationSprints: NormalizedSprint[];
  /** Epics, ordered by milestone number when present, then Jira key order. */
  milestones: NormalizedMilestone[];
  issues: DashboardIssue[];
  /** Issues with P0/P1 severity (any status), P0 first. */
  risks: DashboardIssue[];
  metadata: {
    storyPointsField: string | null;
    /** Discovered Sprint custom field ID (needed to read sprint history). */
    sprintField: string | null;
    normalizedAt: string;
  };
};
