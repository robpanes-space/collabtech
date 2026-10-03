/**
 * History domain + DTO types. Raw Jira changelog shapes never leave src/lib/jira; this layer
 * only sees normalized events. Nothing here contains emails, account IDs or tokens.
 */

import type { StatusCategory } from "@/lib/jira/types";

export type HistoryField =
  | "status"
  | "sprint"
  | "storyPoints"
  | "assignee"
  | "priority"
  | "labels"
  | "resolution"
  | "other";

export type StatusValue = { id: string | null; name: string | null };

/** Field-specific normalized values. */
export type HistoryValue =
  | { kind: "status"; value: StatusValue | null }
  | { kind: "sprint"; value: number[] }
  | { kind: "storyPoints"; value: number | null }
  | { kind: "text"; value: string | null }
  | { kind: "labels"; value: string[] };

export type JiraHistoryEvent = {
  /** Stable ID: `${changeHistoryId}:${itemIndex}`. */
  id: string;
  issueId: string;
  issueKey: string;
  timestamp: string;
  field: HistoryField;
  from: HistoryValue;
  to: HistoryValue;
  /** Display name only (no account ID, no email). */
  actor: { displayName: string } | null;
};

export type IssueTimeline = {
  issueKey: string;
  issueId: string;
  createdAt: string | null;
  /** Ascending by timestamp (stable for equal timestamps). */
  events: JiraHistoryEvent[];
};

/** status ID → category, from GET /rest/api/3/status. */
export type StatusCategoryCatalog = ReadonlyMap<string, StatusCategory>;

// ---------------------------------------------------------------------------
// Availability / confidence
// ---------------------------------------------------------------------------

export type HistoryUnavailableReason =
  | "NO_HISTORY"
  | "SPRINT_DATES_REQUIRED"
  | "SPRINT_NOT_STARTED"
  | "INSUFFICIENT_CHANGELOG"
  | "ESTIMATION_INCOMPLETE"
  | "NO_STATUS_HISTORY"
  | "NO_SPRINT_MEMBERSHIP_HISTORY"
  | "LOW_HISTORY_CONFIDENCE"
  | "TOO_FEW_PERIODS"
  | "HISTORY_UNAVAILABLE";

export type Availability = { available: true } | { available: false; reason: HistoryUnavailableReason; message: string };

export type HistoryConfidence = "high" | "medium" | "low";

export type ConfidenceAssessment = {
  level: HistoryConfidence;
  /** Client-readable reasons the confidence is below high. */
  reasons: string[];
};

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export type ActivityType =
  | "started"
  | "completed"
  | "reopened"
  | "sprint_added"
  | "sprint_removed"
  | "assignee_changed"
  | "estimate_changed"
  | "priority_changed"
  | "risk_resolved"
  | "risk_reopened";

export type HistoryActivityDto = {
  id: string;
  timestamp: string;
  issueKey: string;
  issueSummary: string;
  type: ActivityType;
  /** "SCRUM-14 completed" */
  title: string;
  /** Change detail, e.g. "Added to MIG S1 - Discovery" or "Assigned to Rob". */
  description: string | null;
  actorDisplayName: string;
  /** Null for grouped events (several work items). */
  jiraUrl: string | null;
  /** Keys of all work items in a grouped event (e.g. a sprint-planning batch); else [issueKey]. */
  issueKeys: string[];
};

/** A work item or risk whose FINAL transition to done falls in the window (same rule as throughput). */
export type CompletionDto = {
  issueKey: string;
  summary: string;
  completedAt: string;
  kind: "work" | "risk";
  riskSeverity: "P0" | "P1" | null;
  milestoneLabel: string | null;
  jiraUrl: string | null;
};

export type BurndownPoint = {
  /** Calendar day in DASHBOARD_TIME_ZONE, "YYYY-MM-DD". */
  date: string;
  label: string;
  /** null for days that have not happened yet (no future values are invented). */
  remainingWorkItems: number | null;
  completedWorkItems: number | null;
  scopeWorkItems: number | null;
  remainingStoryPoints: number | null;
  completedStoryPoints: number | null;
  /** Mathematical reference line (not Jira history). */
  idealWorkItems: number;
  idealStoryPoints: number | null;
};

export type SprintScopeChange = {
  /** Work items in the sprint at the sprint start instant. */
  committedWorkItems: number;
  /** Entered the sprint after start (added or created into it). */
  addedWorkItems: number;
  /** In the sprint at/after start but not at the end of the period. */
  removedWorkItems: number;
  /** Individual enter/leave events after start. */
  scopeChangeCount: number;
};

export type SprintHistoryDto = SprintScopeChange & {
  sprintId: number;
  name: string;
  state: "active" | "future" | "closed";
  roadmapPosition: number | null;
  startDate: string | null;
  endDate: string | null;
  completeDate: string | null;
  durationDays: number | null;
  /** Committed items done at close (or now, for an active sprint). */
  completedCommittedWorkItems: number;
  /** Items in the sprint at close/now that are done. */
  finalCompletedWorkItems: number;
  /** Items in the sprint at close/now. */
  finalScopeWorkItems: number;
  /** finalCompleted / finalScope × 100 (rounded); null when the sprint has no work. */
  completionRate: number | null;
  committedStoryPoints: number | null;
  completedStoryPoints: number | null;
  availability: Availability;
  confidence: ConfidenceAssessment;
  burndown: {
    workItems: Availability & { points: BurndownPoint[] };
    storyPoints: Availability;
  };
};

export type ProjectTrendPoint = {
  date: string;
  label: string;
  completed: number;
  total: number;
  /** Rounded 0–100. */
  progress: number;
};

export type ThroughputPoint = { periodStart: string; label: string; completed: number };

export type DurationStat = { medianDays: number | null; sampleSize: number; available: boolean };

export type HistoryWarningCode =
  | "HISTORY_INCOMPLETE"
  | "BURNDOWN_UNAVAILABLE"
  | "STORY_POINT_HISTORY_INCOMPLETE"
  | "SPRINT_MEMBERSHIP_HISTORY_INCOMPLETE"
  | "SPRINT_DATES_REQUIRED"
  | "LOW_HISTORY_CONFIDENCE";

/** Reconstructed final state compared with current Jira state (counts only). */
export type HistoryValidationSummary = {
  checkedIssues: number;
  consistentIssues: number;
  statusMismatches: number;
  sprintMismatches: number;
  storyPointMismatches: number;
  doneWithoutStatusHistory: number;
  missingCreatedDates: number;
};

export type HistoryWarning = { code: HistoryWarningCode; level: "info" | "warning"; message: string };

export type HistoryDto = {
  sync: { timestamp: string; source: "jira"; cacheSeconds: number; timeZone: string };
  recentActivity: HistoryActivityDto[];
  /** Completions in the last 30 days, newest first (reopened-and-not-redone items excluded). */
  completions: CompletionDto[];
  projectTrend: Availability & {
    points: ProjectTrendPoint[];
    granularity: "day" | "week";
    unit: "workItems";
    /** Always the CURRENT committed scope, reconstructed over time. */
    scopeBasis: "current_committed_scope";
    confidence: ConfidenceAssessment;
  };
  /** Dated migration sprints and other active sprints, roadmap order. */
  sprints: SprintHistoryDto[];
  /** Closed migration sprints only (completion history). */
  sprintHistory: SprintHistoryDto[];
  activeSprintBurndown: SprintHistoryDto | null;
  throughput: Availability & { points: ThroughputPoint[]; granularity: "week" };
  cycleTime: DurationStat;
  leadTime: DurationStat;
  availability: {
    recentActivity: boolean;
    projectTrend: boolean;
    sprintBurndown: boolean;
    throughput: boolean;
    velocity: boolean;
  };
  warnings: HistoryWarning[];
  validation: HistoryValidationSummary;
};
