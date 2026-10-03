/**
 * Project data readiness — deterministic checks of whether Jira data is clean enough for
 * client reporting. Read-only: it tells the operator what to change in Jira; it never changes
 * Jira and never alters dashboard calculations.
 */

export type CheckStatus = "pass" | "warning" | "fail" | "not_applicable";

/**
 * critical      — a fail makes the overall status Blocked; a warning makes it Attention
 * important     — a fail or warning makes the overall status Attention
 * informational — never changes the overall status
 */
export type CheckImportance = "critical" | "important" | "informational";

export type ReadinessCategory =
  | "jira_configuration"
  | "sprint_planning"
  | "estimation"
  | "work_classification"
  | "risks_blockers"
  | "historical_analytics"
  | "client_dashboard";

export type ReadinessCheckCode =
  | "STORY_POINT_FIELD"
  | "SPRINT_FIELD"
  | "BLOCKED_STATUS_CONFIG"
  | "ACTIVE_MIGRATION_SPRINT"
  | "EMPTY_ACTIVE_SPRINT"
  | "SPRINT_DATES"
  | "STORY_POINT_COVERAGE"
  | "EXCLUDED_WORK"
  | "UNCLASSIFIED_WORK"
  | "OPEN_P0_RISKS"
  | "OPEN_P1_RISKS"
  | "BLOCKER_DETECTION"
  | "HISTORY_SOURCE"
  | "HISTORY_CONSISTENCY"
  | "SPRINT_HISTORY"
  | "BURNDOWN_READINESS"
  | "THROUGHPUT_READINESS"
  | "PROJECT_TREND_READINESS"
  | "CLIENT_ACCESS"
  | "PROJECT_ACCESS_SIGN_IN"
  | "DISPLAY_TIME_ZONE"
  | "JIRA_LINKS";

/** Jira items referenced by a check (admin view only; keys and summaries, never people). */
export type ReadinessItem = { key: string; summary: string; jiraUrl: string | null };

export type ReadinessCheck = {
  code: ReadinessCheckCode;
  category: ReadinessCategory;
  importance: CheckImportance;
  status: CheckStatus;
  title: string;
  message: string;
  /** What the operator should change in Jira/configuration; null when nothing is needed. */
  action: string | null;
  items: ReadinessItem[];
};

export type BurndownReadinessState = "available" | "waiting_for_start" | "missing_dates" | "insufficient_history" | "low_confidence";

export type SprintBurndownReadiness = {
  sprintId: number;
  name: string;
  roadmapPosition: number | null;
  state: BurndownReadinessState;
  confidence: "high" | "medium" | "low" | null;
  message: string;
};

export type OverallReadiness = "ready" | "attention" | "blocked";

/** Live facts behind the checks (counts and sprint names only). */
export type ReadinessFacts = {
  activeSprints: string[];
  activeMigrationSprints: string[];
  emptyActiveSprints: string[];
  migrationSprintsScheduled: number;
  migrationSprintsTotal: number;
  estimationCoverage: number | null;
  estimatedWorkItems: number;
  eligibleWorkItems: number;
  progressMethod: "storyPoints" | "workItems";
  includedWorkItems: number;
  excludedWorkItems: number;
  unclassifiedWorkItems: number;
  openP0Risks: number;
  openP1Risks: number;
  linkBlockedWorkItems: number;
  statusBlockedWorkItems: number;
  blockedWorkItems: number;
  blockedStatusesConfigured: string[];
  historyAvailable: boolean;
};

/**
 * Client-safe data-confidence signal: how complete the Jira data behind the dashboard is.
 * Data quality only — delivery risk (P0s, blockers) is reported by project health, not here.
 */
export type DataConfidence = {
  level: "good" | "limited" | "low";
  label: "Good" | "Limited" | "Low";
  /** e.g. "Limited: sprint schedule and estimates incomplete." */
  summary: string;
  /** Short client-friendly phrases (no keys, names or counts). */
  reasons: string[];
};

export type ProjectReadinessDto = {
  generatedAt: string;
  overall: {
    status: OverallReadiness;
    /** Counts of non-informational checks by status (no decorative score). */
    counts: Record<CheckStatus, number>;
    summary: string;
  };
  sections: { category: ReadinessCategory; title: string; checks: ReadinessCheck[] }[];
  burndown: SprintBurndownReadiness[];
  facts: ReadinessFacts;
  dataConfidence: DataConfidence;
};
