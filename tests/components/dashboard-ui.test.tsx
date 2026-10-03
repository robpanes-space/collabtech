import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BlockerPanel } from "@/components/dashboard/blocker-panel";
import { CurrentSprintCard, MultipleActiveSprintsNotice } from "@/components/dashboard/current-sprint";
import { DashboardWarnings } from "@/components/dashboard/dashboard-notice";
import { DeliveryPace } from "@/components/dashboard/delivery-pace";
import { EstimationCoverage } from "@/components/dashboard/estimation-coverage";
import { MetricCard } from "@/components/dashboard/metric-card";
import { MilestoneProgress } from "@/components/dashboard/milestone-progress";
import { OverallProgress } from "@/components/dashboard/overall-progress";
import { RiskSummary } from "@/components/dashboard/risk-summary";
import { SprintRoadmap } from "@/components/dashboard/sprint-roadmap";
import { HealthBadge } from "@/components/dashboard/status";
import { WorkloadChart } from "@/components/charts/workload-chart";
import { RiskList } from "@/components/risks/risk-register";
import { SprintWorkItems } from "@/components/sprint/sprint-detail";
import { buildDashboardDto } from "@/lib/dashboard/dashboard";
import { currentSprintOf, otherActiveSprints } from "@/lib/dashboard/selectors";
import { normalizeProjectData } from "@/lib/jira/normalize";
import { defaultOptions, fixtures } from "../fixtures/jira";
import { blockedBy, buildData, NOW, raw, sprint } from "../dashboard/helpers";

/** Rendered HTML and its visible text (tags stripped, whitespace collapsed). */
function render(element: ReactElement) {
  const html = renderToStaticMarkup(element);
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return { html, text };
}

/** Live-like fixture: SCRUM Sprint 0 + MIG S1 active, MIG S2–S8 future without dates. */
function liveLikeDto() {
  const data = buildData({
    sprints: [
      sprint(1, "MIG S1 - Discovery", "active", { startDate: "2026-10-05T07:28:00.000Z", endDate: "2026-10-19T07:28:00.000Z" }),
      sprint(2, "SCRUM Sprint 0", "active", { startDate: "2026-10-03T06:48:59.722Z", endDate: "2026-10-17T06:48:59.722Z" }),
      ...["Schema Mapping", "Loads Quotes I", "Loads Quotes II", "UI Finance", "Integrated QA", "UAT Rehearsal", "Cutover"].map((name, i) =>
        sprint(3 + i, `MIG S${i + 2} - ${name}`, "future"),
      ),
    ],
    projectIssues: [
      raw({ key: "SCRUM-5", type: "Epic", summary: "M1 - Discovery, Metadata & Architecture" }),
      raw({ key: "SCRUM-48", type: "Epic", summary: "M9 - Future or Additional Development (Optional)" }),
      raw({ key: "SCRUM-38", summary: "I-01 P0 - Tenant Metadata Absent" }),
      raw({ key: "SCRUM-45", summary: "I-08 P1 - Rules and Reports Incomplete" }),
      raw({ key: "SCRUM-3", summary: "Task 3", category: "in_progress" }),
    ],
    sprintIssues: {
      1: [
        raw({ key: "SCRUM-14", summary: "M1.2 - Salesforce Metadata and Data Profile", parent: { key: "SCRUM-5" }, links: [blockedBy("SCRUM-38")] }),
        raw({ key: "SCRUM-13", summary: "M1.1 - Stakeholders and Process Trace", parent: { key: "SCRUM-5" } }),
      ],
    },
  });
  return buildDashboardDto(data, NOW);
}

const dto = liveLikeDto();

describe("MetricCard", () => {
  it("shows the provenance line without requiring hover", () => {
    const { text } = render(<MetricCard label="P0 risks" value={7} provenance="Open risks identified as P0" />);
    expect(text).toContain("P0 risks 7 Open risks identified as P0");
  });
});

describe("OverallProgress", () => {
  it("work-item based progress explains its method", () => {
    const { text } = render(<OverallProgress summary={dto.summary} />);
    expect(text).toContain("Project progress");
    expect(text).toContain(`${dto.summary.overallProgress.value}%`);
    expect(text).toContain(`0 of ${dto.summary.totalWorkItems.value} work items completed`);
    expect(text).toContain("Based on work items");
  });

  it("story-point based progress fixture", () => {
    const estimated = buildDashboardDto(
      buildData({ projectIssues: [raw({ category: "done", points: 3 }), raw({ points: 5 }), raw({ points: 2 })] }),
      NOW,
    );
    const { text } = render(<OverallProgress summary={estimated.summary} />);
    expect(text).toContain("30%");
    expect(text).toContain("3 of 10 story points completed");
    expect(text).toContain("Based on story points");
  });
});

describe("EstimationCoverage", () => {
  it("shows 0% coverage and the estimated count — not as progress", () => {
    const { text } = render(<EstimationCoverage summary={dto.summary} />);
    expect(text).toContain("Story-point coverage 0%");
    expect(text).toContain(`0 / ${dto.summary.totalWorkItems.value} work items estimated`);
    expect(text).not.toContain("Project progress");
  });
});

describe("current sprint", () => {
  const current = currentSprintOf(dto);

  it("renders the active migration sprint with health, goal-free fallback and next sprint", () => {
    const { text } = render(<CurrentSprintCard sprint={current} following={dto.migrationState.followingMigrationSprint} />);
    expect(text).toContain("MIG S1 - Discovery");
    expect(text).toContain("Active");
    expect(text).toContain("Blocked");
    expect(text).toContain("Oct 5 – Oct 19, 2026");
    expect(text).toContain("Next sprint MIG S2 - Schema Mapping · Schedule not set");
  });

  it("empty state when Jira has no active sprint", () => {
    expect(render(<CurrentSprintCard sprint={null} following={null} />).text).toContain("No active sprint");
  });

  it("multiple-active-sprint notice is informational and names both sprints", () => {
    const { html, text } = render(<MultipleActiveSprintsNotice shown={current} others={otherActiveSprints(dto, current)} />);
    expect(text).toContain("2 Jira sprints are currently active");
    expect(text).toContain("showing MIG S1 - Discovery");
    expect(text).toContain("Also active: SCRUM Sprint 0 (no work items)");
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
  });

  it("no notice when only one sprint is active", () => {
    expect(render(<MultipleActiveSprintsNotice shown={current} others={[]} />).html).toBe("");
  });
});

describe("SprintRoadmap", () => {
  it("keeps backend roadmap order and shows Schedule not set for undated sprints", () => {
    const { text, html } = render(<SprintRoadmap sprints={dto.migrationSprints} />);
    const order = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"].map((label) => text.indexOf(`${label} `));
    expect(order.every((index, i) => index >= 0 && (i === 0 || index > order[i - 1]!))).toBe(true);
    expect(text.match(/Schedule not set/g)).toHaveLength(7);
    expect(text).not.toMatch(/Invalid Date|undefined|null|NaN/);
    expect(html).toContain('href="/sprints/1"');
  });

  it("empty state without migration sprints", () => {
    expect(render(<SprintRoadmap sprints={[]} />).text).toContain("No migration sprints");
  });
});

describe("health labels", () => {
  it.each([
    ["healthy", "On track"],
    ["at_risk", "At risk"],
    ["blocked", "Blocked"],
    ["complete", "Complete"],
    ["future", "Upcoming"],
  ] as const)("%s → %s (icon + text, not color alone)", (status, label) => {
    const { html, text } = render(<HealthBadge status={status} />);
    expect(text).toBe(label);
    expect(html).toContain("<svg");
  });
});

describe("MilestoneProgress", () => {
  it("shows committed milestones only and notes the optional one", () => {
    const { text } = render(<MilestoneProgress milestones={dto.milestones} />);
    expect(text).toContain("M1 Discovery, Metadata & Architecture");
    expect(text).toContain("1 open P0");
    expect(text).toContain("1 blocked");
    expect(text).toContain("Not included in committed progress: M9 - Future or Additional Development (Optional).");
    expect(text.indexOf("M9")).toBe(text.lastIndexOf("M9"));
  });
});

describe("risks", () => {
  it("RiskSummary shows open P0 and P1 separately", () => {
    const { text } = render(<RiskSummary distribution={dto.charts.riskDistribution} risks={dto.risks} />);
    expect(text).toContain("P0 1 open");
    expect(text).toContain("P1 1 open");
    expect(text).toContain("I-01 Tenant Metadata Absent · blocks 1");
  });

  it("empty risk state", () => {
    expect(render(<RiskList risks={[]} />).text).toContain("No risks");
    const none = buildDashboardDto(buildData({}), NOW);
    expect(render(<RiskSummary distribution={none.charts.riskDistribution} risks={none.risks} />).text).toContain("No open risks");
  });
});

describe("BlockerPanel", () => {
  it("lists blocked work with readable blocking risk", () => {
    const { text } = render(<BlockerPanel blockers={dto.blockers} />);
    expect(text).toContain("M1.2 - Salesforce Metadata and Data Profile · SCRUM-14 · M1");
    expect(text).toContain("Blocked by P0 I-01 Tenant Metadata Absent");
  });

  it("caps the list and says so", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...dto.blockers[0]!, key: `SCRUM-${100 + i}` }));
    expect(render(<BlockerPanel blockers={many} />).text).toContain("Showing 5 of 8 blocked work items.");
  });

  it("empty state when nothing is blocked", () => {
    expect(render(<BlockerPanel blockers={[]} />).text).toContain("No blocked work");
  });
});

describe("sprint work items", () => {
  it("groups blocked first and shows readable blockers and missing assignee", () => {
    const { text } = render(<SprintWorkItems items={currentSprintOf(dto)?.workItems ?? []} />);
    expect(text.indexOf("Blocked 1")).toBeLessThan(text.indexOf("To do 1"));
    expect(text).toContain("Blocked by P0 I-01 Tenant Metadata Absent");
    expect(text).toContain("Unassigned");
  });
});

describe("DeliveryPace", () => {
  it("hides story-point velocity when unavailable and shows an empty state", () => {
    const { text } = render(<DeliveryPace charts={dto.charts} />);
    expect(text).not.toContain("Story-point velocity");
    expect(text).toContain("No velocity data yet");
  });

  it("falls back to work-item throughput for closed sprints without full estimates", () => {
    const closed = buildDashboardDto(
      buildData({
        sprints: [sprint(11, "MIG S1 - Discovery", "closed")],
        sprintIssues: { 11: [raw({ category: "done" }), raw()] },
      }),
      NOW,
    );
    const { text } = render(<DeliveryPace charts={closed.charts} />);
    expect(text).toContain("Work-item throughput");
    expect(text).not.toContain("Story-point velocity");
    expect(text).toContain("MIG S1 - Discovery: 1 of 2 work items completed");
  });
});

describe("WorkloadChart", () => {
  it("includes Unassigned in the accessible summary and never emails", () => {
    const { text } = render(<WorkloadChart entries={dto.charts.workload} />);
    expect(text).toContain("Unassigned:");
    expect(text).not.toContain("@");
  });
});

describe("DashboardWarnings", () => {
  it("uses client-friendly titles, keeps codes as metadata, and can exclude codes", () => {
    const { html, text } = render(<DashboardWarnings warnings={dto.warnings} exclude={["MULTIPLE_ACTIVE_SPRINTS"]} />);
    expect(text).toContain("Story-point estimation incomplete");
    expect(text).toContain("Sprint dates not configured");
    expect(text).not.toMatch(/STORY_POINTS_INCOMPLETE|MISSING_SPRINT_DATES/);
    expect(html).toContain('data-code="STORY_POINTS_INCOMPLETE"');
    expect(text).not.toContain("Multiple active Jira sprints");
  });
});

describe("full fixture DTO renders without raw Jira data", () => {
  it("no Jira internals leak into rendered sections", () => {
    const issues = fixtures.issues();
    const fixtureDto = buildDashboardDto(
      normalizeProjectData(
        {
          project: fixtures.project(),
          board: fixtures.board(),
          sprints: fixtures.sprints(),
          projectIssues: [...issues, fixtures.riskP0(), fixtures.riskP1()],
          sprintIssues: { 1: issues.slice(3), 3: [fixtures.blockedIssue(), fixtures.unestimatedIssue()] },
        },
        defaultOptions,
        NOW,
      ),
      NOW,
    );
    const { html } = render(
      <>
        <MilestoneProgress milestones={fixtureDto.milestones} />
        <SprintRoadmap sprints={fixtureDto.migrationSprints} />
        <BlockerPanel blockers={fixtureDto.blockers} />
      </>,
    );
    expect(html).not.toMatch(/customfield_|issuelinks|statusCategory|atlassian\.net/);
  });
});
