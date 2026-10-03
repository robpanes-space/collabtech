/**
 * Client-facing dashboard contract (GET /api/jira/dashboard).
 * Type-only module: safe to import from client components. No raw Jira shapes, no emails.
 */

import type { ProgressMethod, SprintState, StatusCategory } from "@/lib/jira/types";

export type { ProgressMethod };

export type MetricSource = "storyPoints" | "workItems" | "jira" | "issueLinks" | "labels" | "derived";

export type MetricValue<T = number> = {
  value: T;
  source: MetricSource;
  label: string;
  /** Provenance line for the UI, e.g. "Based on completed story points." */
  description?: string;
};

/** A displayed percentage: `value` is the rounded 0–100 integer, `raw` the exact ratio. */
export type Percentage = { value: number; raw: number };

export type ProgressMetric = MetricValue<number> & {
  raw: number;
  method: ProgressMethod;
  /** Completed / total in the method's unit (story points or work items). */
  completed: number;
  total: number;
  /** Rounded % of in-scope work items with a story-point estimate; null if no work items. */
  estimationCoverage: number | null;
};

export type SprintHealth = "complete" | "healthy" | "at_risk" | "blocked" | "future";
export type MilestoneHealth = "complete" | "healthy" | "at_risk" | "blocked";
export type ProjectHealth = MilestoneHealth;

/** Display bucket for work-item lists: blocked takes precedence over unresolved categories. */
export type WorkItemGroup = "blocked" | "in_progress" | "todo" | "done" | "unknown";

export type HealthAssessment<H> = {
  status: H;
  /** Client-friendly reasons for the status, most important first. */
  reasons: string[];
};

export type WorkItemDto = {
  key: string;
  /** Jira browse link (https://<site>/browse/KEY), or null when links are disabled. */
  jiraUrl: string | null;
  summary: string;
  type: string;
  status: string;
  statusCategory: StatusCategory;
  assignee: string | null;
  storyPoints: number | null;
  blocked: boolean;
  blockers: string[];
  /** Client-readable details for each blocker key. */
  blockedBy: BlockingIssueDto[];
  riskSeverity: "P0" | "P1" | null;
  milestoneKey: string | null;
  /** "M1" when the milestone follows the M<n> convention. */
  milestoneLabel: string | null;
  group: WorkItemGroup;
  updatedAt: string | null;
  /** Jira calendar date "YYYY-MM-DD" (no time zone). */
  dueDate: string | null;
};

export type BlockingIssueDto = {
  key: string;
  jiraUrl: string | null;
  registerId: string | null;
  summary: string | null;
  /** Summary without the risk-register prefix; null when the blocker is not in the dataset. */
  title: string | null;
  severity: "P0" | "P1" | null;
};

/** An unresolved, blocked project work item with what blocks it. */
export type BlockedWorkItemDto = {
  key: string;
  jiraUrl: string | null;
  summary: string;
  status: string;
  statusCategory: StatusCategory;
  milestoneKey: string | null;
  milestoneLabel: string | null;
  sprintName: string | null;
  /** Blocked by an open P0 (or is itself P0). */
  critical: boolean;
  blockedBy: BlockingIssueDto[];
};

export type WorkCounts = {
  totalWorkItems: number;
  completedWorkItems: number;
  inProgressWorkItems: number;
  todoWorkItems: number;
  unknownWorkItems: number;
  blockedWorkItems: number;
};

export type ProgressFields = {
  /** Rounded 0–100. */
  progress: number;
  progressRaw: number;
  progressMethod: ProgressMethod;
  /** Rounded 0–100, null when there are no work items. */
  estimationCoverage: number | null;
};

export type SprintDashboardDto = WorkCounts &
  ProgressFields & {
    id: number;
    name: string;
    state: SprintState;
    goal: string | null;
    startDate: string | null;
    endDate: string | null;
    completeDate: string | null;
    isMigrationSprint: boolean;
    /** MIG S<n> number; null for non-migration sprints. */
    roadmapPosition: number | null;
    /** Name without the "MIG S<n> - " prefix, e.g. "Discovery". */
    shortName: string;
    /** Sum over estimated work items (all estimated when progressMethod is storyPoints). */
    storyPointsCommitted: number | null;
    storyPointsCompleted: number | null;
    /** committed − completed over estimated items; null when nothing is estimated. */
    storyPointsRemaining: number | null;
    /** Rounded % of sprint duration elapsed; null when dates are missing/invalid. */
    elapsedPercent: number | null;
    health: HealthAssessment<SprintHealth>;
    milestoneKeys: string[];
    workItems: WorkItemDto[];
  };

export type SprintRefDto = {
  id: number;
  name: string;
  state: SprintState;
  roadmapPosition: number | null;
  startDate: string | null;
  endDate: string | null;
};

export type MilestoneDashboardDto = WorkCounts &
  ProgressFields & {
    key: string;
    /** Full Jira epic summary. */
    name: string;
    /** "M1" when the epic title follows the M<n> convention, else null. */
    milestoneLabel: string | null;
    /** Epic title without the "M<n> - " prefix. */
    title: string;
    milestoneNumber: number | null;
    status: string;
    statusCategory: StatusCategory;
    /** False for optional/future milestones excluded from project totals (e.g. M9). */
    inProjectScope: boolean;
    storyPointsTotal: number | null;
    storyPointsCompleted: number | null;
    openP0Risks: number;
    openP1Risks: number;
    health: HealthAssessment<MilestoneHealth>;
  };

export type RiskDashboardDto = {
  key: string;
  jiraUrl: string | null;
  registerId: string | null;
  summary: string;
  /** Summary without the register prefix ("I-01 P0 - Tenant…" → "Tenant…"). */
  title: string;
  severity: "P0" | "P1";
  status: string;
  statusCategory: StatusCategory;
  resolved: boolean;
  owner: string | null;
  milestoneKey: string | null;
  blocked: boolean;
  /** Keys of unresolved work items this risk currently blocks. */
  blocksWorkItems: string[];
  blocks: { key: string; jiraUrl: string | null; summary: string | null; milestoneLabel: string | null }[];
  updatedAt: string | null;
};

export type SprintProgressPoint = {
  sprintId: string;
  sprint: string;
  shortName: string;
  roadmapPosition: number | null;
  completedWorkItems: number;
  totalWorkItems: number;
  progress: number;
  progressMethod: ProgressMethod;
  state: SprintState;
  health: SprintHealth;
};

export type StatusDistributionPoint = {
  key: "done" | "in_progress" | "todo" | "unknown";
  status: "Done" | "In Progress" | "To Do" | "Unknown";
  count: number;
};

export type VelocityPoint = {
  sprintId: string;
  sprint: string;
  roadmapPosition: number | null;
  /** False when any work item lacks an estimate — never substitute work-item counts. */
  available: boolean;
  committedStoryPoints: number | null;
  completedStoryPoints: number | null;
};

export type ThroughputPoint = {
  sprintId: string;
  sprint: string;
  roadmapPosition: number | null;
  committedWorkItems: number;
  completedWorkItems: number;
};

export type WorkloadEntry = {
  /** Opaque, non-identifying list key ("assignee-1", "unassigned"); never a Jira account ID. */
  key: string;
  unassigned: boolean;
  displayName: string;
  openWorkItems: number;
  inProgressWorkItems: number;
  blockedWorkItems: number;
  /** Sum of estimates on open items; null when none are estimated. */
  storyPointsOpen: number | null;
};

export type MilestoneProgressPoint = {
  key: string;
  milestone: string | null;
  name: string;
  progress: number;
  progressMethod: ProgressMethod;
  health: MilestoneHealth;
};

export type RiskDistributionPoint = {
  severity: "P0" | "P1";
  open: number;
  resolved: number;
};

export type DashboardWarningCode =
  | "STORY_POINTS_INCOMPLETE"
  | "NO_STORY_POINTS_FIELD"
  | "NO_ACTIVE_SPRINT"
  | "MULTIPLE_ACTIVE_SPRINTS"
  | "NO_ACTIVE_MIGRATION_SPRINT"
  | "ACTIVE_NON_MIGRATION_SPRINT"
  | "NO_MIGRATION_SPRINTS"
  | "MISSING_SPRINT_DATES"
  | "VELOCITY_UNAVAILABLE";

export type DashboardWarning = {
  code: DashboardWarningCode;
  level: "info" | "warning";
  message: string;
};

export type DashboardDto = {
  project: { id: string; key: string; name: string };
  board: { id: number; name: string };
  sync: {
    /** When this payload was read from Jira (the whole payload is cached as one unit). */
    timestamp: string;
    source: "jira";
    /** Jira is read at most once per interval; refreshes before nextRefreshAt reuse this payload. */
    refreshIntervalSeconds: number;
    nextRefreshAt: string;
  };
  summary: {
    overallProgress: ProgressMetric;
    totalWorkItems: MetricValue;
    completedWorkItems: MetricValue;
    inProgressWorkItems: MetricValue;
    todoWorkItems: MetricValue;
    blockedWorkItems: MetricValue;
    estimatedWorkItems: MetricValue;
    p0Risks: MetricValue;
    p1Risks: MetricValue;
    resolvedRisks: MetricValue;
    riskAffectedWorkItems: MetricValue;
    completedMilestones: MetricValue;
    totalMilestones: MetricValue;
    completedSprints: MetricValue;
    totalMigrationSprints: MetricValue;
  };
  /** The sprint Jira reports as active (first in board order if several) — never substituted. */
  activeSprint: SprintDashboardDto | null;
  /** Every sprint Jira reports as active, in board order (parallel sprints). */
  activeSprints: SprintDashboardDto[];
  /** Deterministic roll-up of milestone and current-sprint health. */
  projectHealth: HealthAssessment<ProjectHealth>;
  /** Unresolved blocked project work items, critical (P0) first. */
  blockers: BlockedWorkItemDto[];
  migrationState: {
    activeMigrationSprint: SprintRefDto | null;
    /** First roadmap sprint that is not closed and not fully complete. */
    nextMigrationSprint: SprintRefDto | null;
    /**
     * With an active migration sprint: the next sprint after it in roadmap order (null after
     * the last). Otherwise: the first incomplete migration sprint (same as nextMigrationSprint).
     */
    followingMigrationSprint: SprintRefDto | null;
  };
  migrationSprints: SprintDashboardDto[];
  milestones: MilestoneDashboardDto[];
  risks: RiskDashboardDto[];
  charts: {
    sprintProgress: SprintProgressPoint[];
    statusDistribution: StatusDistributionPoint[];
    velocity: { available: boolean; points: VelocityPoint[] };
    throughput: ThroughputPoint[];
    workload: WorkloadEntry[];
    milestoneProgress: MilestoneProgressPoint[];
    riskDistribution: RiskDistributionPoint[];
  };
  /** Recent activity and other history live in HistoryDto (GET /api/jira/history). */
  warnings: DashboardWarning[];
};

export type DashboardErrorDto = {
  error: { code: string; message: string };
};
