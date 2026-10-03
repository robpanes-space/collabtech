import { describe, expect, it } from "vitest";
import { buildRecentActivity } from "@/lib/history/activity";
import { assessConfidence } from "@/lib/history/confidence";
import { calendarDayOf, dayKeysBetween, weekStartKey, zonedDateKey } from "@/lib/history/calendar";
import { buildProjectTrend } from "@/lib/history/project-trend";
import { buildSprintHistory, type SprintInput } from "@/lib/history/sprint-history";
import { buildThroughput } from "@/lib/history/throughput";
import { CATALOG, ctx, ev, timelines, workItem } from "./helpers";

/** Sprint 10: Mon Oct 5 → Fri Oct 9 2026 (UTC); planning on Oct 2. */
const SPRINT: SprintInput = {
  id: 10,
  name: "MIG S1 - Discovery",
  state: "active",
  startDate: "2026-10-05T00:00:00.000Z",
  endDate: "2026-10-09T23:00:00.000Z",
  completeDate: null,
  migrationSprintNumber: 1,
};
const END = "2026-10-09T23:30:00Z";

/** Three items planned into the sprint before it starts (fully evidenced membership). */
function planned(extra: Parameters<typeof workItem>[0][] = []) {
  const items = [
    workItem({ key: "A", created: "2026-10-01T00:00:00Z", sprintIds: [10] }),
    workItem({ key: "B", created: "2026-10-01T00:00:00Z", sprintIds: [10] }),
    workItem({ key: "C", created: "2026-10-01T00:00:00Z", sprintIds: [10] }),
    ...extra.map(workItem),
  ];
  const plan = ["A", "B", "C"].map((key) => ev.sprint(key, "2026-10-02T10:00:00Z", [], [10]));
  return { items, plan };
}

const remaining = (history: ReturnType<typeof buildSprintHistory>) =>
  history.burndown.workItems.points.map((p) => p.remainingWorkItems);

describe("sprint burndown reconstruction", () => {
  it("empty sprint → unavailable (no fake zero series)", () => {
    const history = buildSprintHistory(SPRINT, [], ctx(END));
    expect(history.burndown.workItems).toMatchObject({ available: false, reason: "NO_HISTORY", points: expect.any(Array) });
  });

  it("all incomplete → flat remaining, committed = 3", () => {
    const { items, plan } = planned();
    const history = buildSprintHistory(SPRINT, timelines(items, plan), ctx(END));
    expect(history.burndown.workItems.available).toBe(true);
    expect(remaining(history)).toEqual([3, 3, 3, 3, 3]);
    expect(history).toMatchObject({ committedWorkItems: 3, addedWorkItems: 0, removedWorkItems: 0, confidence: { level: "high" } });
  });

  it("one completion lowers remaining from that day", () => {
    const { items, plan } = planned();
    items[0] = workItem({ key: "A", created: "2026-10-01T00:00:00Z", sprintIds: [10], status: "done" });
    const history = buildSprintHistory(SPRINT, timelines(items, [...plan, ev.status("A", "2026-10-07T15:00:00Z", "todo", "done")]), ctx(END));
    expect(remaining(history)).toEqual([3, 3, 2, 2, 2]);
    expect(history.completedCommittedWorkItems).toBe(1);
  });

  it("multiple completions", () => {
    const { items, plan } = planned();
    items[0] = workItem({ key: "A", created: "2026-10-01T00:00:00Z", sprintIds: [10], status: "done" });
    items[1] = workItem({ key: "B", created: "2026-10-01T00:00:00Z", sprintIds: [10], status: "done" });
    const events = [
      ...plan,
      ev.status("A", "2026-10-06T09:00:00Z", "todo", "progress"),
      ev.status("A", "2026-10-06T17:00:00Z", "progress", "done"),
      ev.status("B", "2026-10-08T12:00:00Z", "todo", "done"),
    ];
    const history = buildSprintHistory(SPRINT, timelines(items, events), ctx(END));
    expect(remaining(history)).toEqual([3, 2, 2, 1, 1]);
    expect(history.finalCompletedWorkItems).toBe(2);
    expect(history.completionRate).toBe(67);
  });

  it("reopened work becomes remaining again (Done is not irreversible)", () => {
    const { items, plan } = planned();
    items[0] = workItem({ key: "A", created: "2026-10-01T00:00:00Z", sprintIds: [10], status: "progress" });
    const events = [...plan, ev.status("A", "2026-10-06T10:00:00Z", "todo", "done"), ev.status("A", "2026-10-08T10:00:00Z", "done", "progress")];
    const history = buildSprintHistory(SPRINT, timelines(items, events), ctx(END));
    expect(remaining(history)).toEqual([3, 2, 2, 3, 3]);
  });

  it("issue added mid-sprint increases scope; counted as added, not committed", () => {
    const { items, plan } = planned([{ key: "D", created: "2026-10-01T00:00:00Z", sprintIds: [10] }]);
    const history = buildSprintHistory(SPRINT, timelines(items, [...plan, ev.sprint("D", "2026-10-07T09:00:00Z", [], [10])]), ctx(END));
    expect(remaining(history)).toEqual([3, 3, 4, 4, 4]);
    expect(history.burndown.workItems.points.map((p) => p.scopeWorkItems)).toEqual([3, 3, 4, 4, 4]);
    expect(history).toMatchObject({ committedWorkItems: 3, addedWorkItems: 1, removedWorkItems: 0, scopeChangeCount: 1 });
  });

  it("issue removed mid-sprint decreases scope", () => {
    const { items, plan } = planned();
    items[2] = workItem({ key: "C", created: "2026-10-01T00:00:00Z", sprintIds: [] });
    const history = buildSprintHistory(SPRINT, timelines(items, [...plan, ev.sprint("C", "2026-10-08T09:00:00Z", [10], [])]), ctx(END));
    expect(remaining(history)).toEqual([3, 3, 3, 2, 2]);
    expect(history).toMatchObject({ committedWorkItems: 3, removedWorkItems: 1, finalScopeWorkItems: 2 });
  });

  it("issue created mid-sprint enters scope at creation (membership inferred → medium confidence)", () => {
    const { items, plan } = planned([{ key: "E", created: "2026-10-07T14:00:00Z", sprintIds: [10] }]);
    const history = buildSprintHistory(SPRINT, timelines(items, plan), ctx(END));
    expect(remaining(history)).toEqual([3, 3, 4, 4, 4]);
    expect(history.addedWorkItems).toBe(1);
    expect(history.confidence.level).toBe("medium");
    expect(history.burndown.workItems.available).toBe(true);
  });

  it("does not assume today's sprint contents existed at start", () => {
    const { items, plan } = planned([{ key: "D", created: "2026-10-01T00:00:00Z", sprintIds: [10] }]);
    const history = buildSprintHistory(SPRINT, timelines(items, [...plan, ev.sprint("D", "2026-10-09T09:00:00Z", [], [10])]), ctx(END));
    expect(history.committedWorkItems).toBe(3);
    expect(remaining(history)[0]).toBe(3);
  });

  it("ideal line is fixed from the start commitment and does not change with scope", () => {
    const { items, plan } = planned([{ key: "D", created: "2026-10-01T00:00:00Z", sprintIds: [10] }]);
    const history = buildSprintHistory(SPRINT, timelines(items, [...plan, ev.sprint("D", "2026-10-07T09:00:00Z", [], [10])]), ctx(END));
    expect(history.burndown.workItems.points.map((p) => p.idealWorkItems)).toEqual([3, 2.3, 1.5, 0.8, 0]);
  });

  it("days that have not happened are null (no future burndown)", () => {
    const { items, plan } = planned();
    const history = buildSprintHistory(SPRINT, timelines(items, plan), ctx("2026-10-07T12:00:00Z"));
    expect(remaining(history)).toEqual([3, 3, 3, null, null]);
  });

  it("requires dates and a started sprint", () => {
    expect(buildSprintHistory({ ...SPRINT, endDate: null }, [], ctx(END)).availability).toMatchObject({ reason: "SPRINT_DATES_REQUIRED" });
    expect(buildSprintHistory(SPRINT, [], ctx("2026-10-03T00:00:00Z")).availability).toMatchObject({
      reason: "SPRINT_NOT_STARTED",
      message: "This sprint starts Oct 5; history begins then.",
    });
  });

  it("closed sprint evaluates at the complete date", () => {
    const { items, plan } = planned();
    items[0] = workItem({ key: "A", created: "2026-10-01T00:00:00Z", sprintIds: [10], status: "done" });
    const closed = { ...SPRINT, state: "closed" as const, completeDate: "2026-10-08T12:00:00.000Z" };
    // A completed after the sprint closed → not credited to this sprint.
    const history = buildSprintHistory(closed, timelines(items, [...plan, ev.status("A", "2026-10-08T15:00:00Z", "todo", "done")]), ctx("2026-10-20T00:00:00Z"));
    expect(history.finalCompletedWorkItems).toBe(0);
    expect(remaining(history)).toEqual([3, 3, 3, 3, null]);
  });
});

describe("story-point burndown", () => {
  function estimated(pointsC: number | null = 5) {
    const items = [
      workItem({ key: "A", created: "2026-10-01T00:00:00Z", sprintIds: [10], points: 3, status: "done" }),
      workItem({ key: "B", created: "2026-10-01T00:00:00Z", sprintIds: [10], points: 2 }),
      workItem({ key: "C", created: "2026-10-01T00:00:00Z", sprintIds: [10], points: pointsC }),
    ];
    const events = [
      ...["A", "B", "C"].map((key) => ev.sprint(key, "2026-10-02T10:00:00Z", [], [10])),
      ev.status("A", "2026-10-06T10:00:00Z", "todo", "done"),
    ];
    return { items, events };
  }

  it("complete estimate history → story-point series", () => {
    const { items, events } = estimated();
    const history = buildSprintHistory(SPRINT, timelines(items, events), ctx(END));
    expect(history.burndown.storyPoints.available).toBe(true);
    expect(history.burndown.workItems.points.map((p) => p.remainingStoryPoints)).toEqual([10, 7, 7, 7, 7]);
    expect(history).toMatchObject({ committedStoryPoints: 10, completedStoryPoints: 3 });
  });

  it("estimate changed during the sprint is reflected on that day", () => {
    const { items, events } = estimated(5);
    const history = buildSprintHistory(SPRINT, timelines(items, [...events, ev.points("C", "2026-10-08T10:00:00Z", 1, 5)]), ctx(END));
    expect(history.burndown.workItems.points.map((p) => p.remainingStoryPoints)).toEqual([6, 3, 3, 7, 7]);
  });

  it("missing estimate → story-point burndown unavailable, work items still available", () => {
    const { items, events } = estimated(null);
    const history = buildSprintHistory(SPRINT, timelines(items, events), ctx(END));
    expect(history.burndown.storyPoints).toMatchObject({ available: false, reason: "ESTIMATION_INCOMPLETE" });
    expect(history.burndown.workItems.available).toBe(true);
    expect(history.burndown.workItems.points.every((p) => p.remainingStoryPoints === null)).toBe(true);
    expect(history.committedStoryPoints).toBeNull();
  });

  it("estimate added only after the sprint started → incomplete", () => {
    const { items, events } = estimated(5);
    const history = buildSprintHistory(SPRINT, timelines(items, [...events, ev.points("C", "2026-10-07T10:00:00Z", null, 5)]), ctx(END));
    expect(history.burndown.storyPoints.available).toBe(false);
  });
});

describe("day boundaries", () => {
  it("uses DASHBOARD_TIME_ZONE for day boundaries", () => {
    // 2026-10-06T20:00Z is Oct 6 in UTC but Oct 7 04:00 in Manila.
    const { items, plan } = planned();
    items[0] = workItem({ key: "A", created: "2026-10-01T00:00:00Z", sprintIds: [10], status: "done" });
    const events = [...plan, ev.status("A", "2026-10-06T20:00:00Z", "todo", "done")];
    const utc = buildSprintHistory(SPRINT, timelines(items, events), ctx(END, "UTC"));
    const manila = buildSprintHistory(SPRINT, timelines(items, events), ctx(END, "Asia/Manila"));
    expect(utc.burndown.workItems.points.find((p) => p.date === "2026-10-06")?.remainingWorkItems).toBe(2);
    expect(manila.burndown.workItems.points.find((p) => p.date === "2026-10-06")?.remainingWorkItems).toBe(3);
    expect(manila.burndown.workItems.points.find((p) => p.date === "2026-10-07")?.remainingWorkItems).toBe(2);
    expect(zonedDateKey(new Date("2026-10-06T20:00:00Z"), "Asia/Manila")).toBe("2026-10-07");
  });

  it("date-only sprint dates are calendar days (never shifted)", () => {
    expect(calendarDayOf("2026-10-05", "America/New_York")).toBe("2026-10-05");
    expect(calendarDayOf("2026-10-05T02:00:00Z", "America/New_York")).toBe("2026-10-04");
    const history = buildSprintHistory({ ...SPRINT, startDate: "2026-10-05", endDate: "2026-10-09" }, [], ctx(END, "America/New_York"));
    expect(history.burndown.workItems.points.map((p) => p.date)).toEqual(dayKeysBetween("2026-10-05", "2026-10-09"));
  });

  it("weeks start on Monday", () => {
    expect(weekStartKey("2026-10-04")).toBe("2026-09-28");
    expect(weekStartKey("2026-10-05")).toBe("2026-10-05");
  });
});

describe("confidence", () => {
  it("complete history → high", () => {
    const { items, plan } = planned();
    expect(assessConfidence(timelines(items, plan), { sprintFieldKnown: true, sprintId: 10 }).level).toBe("high");
  });

  it("partial membership → medium", () => {
    const { items, plan } = planned();
    expect(assessConfidence(timelines(items, plan.slice(1)), { sprintFieldKnown: true, sprintId: 10 }).level).toBe("medium");
    expect(assessConfidence(timelines(items, []), { sprintFieldKnown: false, sprintId: 10 }).level).toBe("medium");
  });

  it("done without any status history → low and burndown hidden", () => {
    const { items, plan } = planned();
    items[0] = workItem({ key: "A", created: "2026-10-01T00:00:00Z", sprintIds: [10], status: "done" });
    const history = buildSprintHistory(SPRINT, timelines(items, plan), ctx(END));
    expect(history.confidence.level).toBe("low");
    expect(history.burndown.workItems).toMatchObject({ available: false, reason: "LOW_HISTORY_CONFIDENCE" });
  });

  it("status history that does not land on the current status → low", () => {
    const { items, plan } = planned();
    const history = buildSprintHistory(SPRINT, timelines(items, [...plan, ev.status("A", "2026-10-06T10:00:00Z", "todo", "progress")]), ctx(END));
    expect(history.confidence.level).toBe("low");
  });
});

describe("project trend", () => {
  const NOW = "2026-10-09T12:00:00Z";
  it("zero completed is a real 0% series (scope exists)", () => {
    const { items } = planned();
    const trend = buildProjectTrend(timelines(items, []), ctx(NOW));
    expect(trend.available).toBe(true);
    expect(trend.points.every((p) => p.progress === 0 && p.total === 3)).toBe(true);
    expect(trend).toMatchObject({ unit: "workItems", scopeBasis: "current_committed_scope", granularity: "day" });
  });

  it("incremental completion, reopen decreases, new issue grows scope", () => {
    const items = [
      workItem({ key: "A", created: "2026-10-05T00:00:00Z", status: "done" }),
      workItem({ key: "B", created: "2026-10-05T00:00:00Z", status: "progress" }),
      workItem({ key: "C", created: "2026-10-07T12:00:00Z" }),
    ];
    const events = [
      ev.status("A", "2026-10-06T10:00:00Z", "todo", "done"),
      ev.status("B", "2026-10-06T11:00:00Z", "todo", "done"),
      ev.status("B", "2026-10-08T11:00:00Z", "done", "progress"),
    ];
    const trend = buildProjectTrend(timelines(items, events), ctx(NOW));
    expect(trend.points.map((p) => [p.date, p.completed, p.total, p.progress])).toEqual([
      ["2026-10-05", 0, 2, 0],
      ["2026-10-06", 2, 2, 100],
      ["2026-10-07", 2, 3, 67],
      ["2026-10-08", 1, 3, 33],
      ["2026-10-09", 1, 3, 33],
    ]);
  });

  it("less than two days of history → unavailable", () => {
    const items = [workItem({ key: "A", created: "2026-10-09T01:00:00Z" })];
    expect(buildProjectTrend(timelines(items, []), ctx(NOW))).toMatchObject({ available: false, reason: "INSUFFICIENT_CHANGELOG" });
  });
});

describe("throughput, cycle and lead time", () => {
  it("groups completions into Monday-start weeks", () => {
    const items = [
      workItem({ key: "A", created: "2026-09-20T00:00:00Z", status: "done" }),
      workItem({ key: "B", created: "2026-09-20T00:00:00Z", status: "done" }),
    ];
    const events = [ev.status("A", "2026-09-27T23:00:00Z", "todo", "done"), ev.status("B", "2026-10-05T01:00:00Z", "todo", "done")];
    const { throughput } = buildThroughput(timelines(items, events), ctx("2026-10-09T00:00:00Z"));
    expect(throughput.available).toBe(true);
    expect(throughput.points.map((p) => [p.periodStart, p.completed])).toEqual([
      ["2026-09-14", 0],
      ["2026-09-21", 1],
      ["2026-09-28", 0],
      ["2026-10-05", 1],
    ]);
    expect(throughput.points[1]?.label).toBe("Sep 21 – Sep 27");
  });

  it("a reopened item is counted once, in the week of its final completion; currently reopened items are not counted", () => {
    const items = [
      workItem({ key: "A", created: "2026-09-20T00:00:00Z", status: "done" }),
      workItem({ key: "B", created: "2026-09-20T00:00:00Z", status: "progress" }),
    ];
    const events = [
      ev.status("A", "2026-09-22T10:00:00Z", "todo", "done"),
      ev.status("A", "2026-09-23T10:00:00Z", "done", "progress"),
      ev.status("A", "2026-10-06T10:00:00Z", "progress", "done"),
      ev.status("B", "2026-09-22T10:00:00Z", "todo", "done"),
      ev.status("B", "2026-09-24T10:00:00Z", "done", "progress"),
    ];
    const { throughput } = buildThroughput(timelines(items, events), ctx("2026-10-09T00:00:00Z"));
    expect(throughput.points.reduce((n, p) => n + p.completed, 0)).toBe(1);
    expect(throughput.points.find((p) => p.periodStart === "2026-10-05")?.completed).toBe(1);
  });

  it("too few weeks or no completions → unavailable", () => {
    const items = [workItem({ key: "A", created: "2026-10-05T00:00:00Z" })];
    expect(buildThroughput(timelines(items, []), ctx("2026-10-06T00:00:00Z")).throughput).toMatchObject({ available: false, reason: "NO_STATUS_HISTORY" });
  });

  it("median cycle and lead time only with ≥ 5 samples", () => {
    const keys = ["A", "B", "C", "D", "E"];
    const items = keys.map((key) => workItem({ key, created: "2026-10-01T00:00:00Z", status: "done" }));
    const events = keys.flatMap((key, i) => [
      ev.status(key, "2026-10-02T00:00:00Z", "todo", "progress"),
      ev.status(key, `2026-10-0${3 + i}T00:00:00Z`, "progress", "done"),
    ]);
    const all = buildThroughput(timelines(items, events), ctx("2026-10-09T00:00:00Z"));
    expect(all.cycleTime).toEqual({ available: true, sampleSize: 5, medianDays: 3 });
    expect(all.leadTime).toEqual({ available: true, sampleSize: 5, medianDays: 4 });
    const few = buildThroughput(timelines(items.slice(0, 4), events), ctx("2026-10-09T00:00:00Z"));
    expect(few.cycleTime).toEqual({ available: false, sampleSize: 4, medianDays: null });
  });
});

describe("recent activity", () => {
  const NOW = new Date("2026-10-09T12:00:00Z");
  const activityCtx = {
    now: NOW,
    catalog: CATALOG,
    sprintNameById: new Map([[10, "MIG S1 - Discovery"]]),
    issueUrl: (key: string) => `https://site.example/browse/${key}`,
  };
  const items = [
    workItem({ key: "A", created: "2026-09-01T00:00:00Z", status: "progress", sprintIds: [10], summary: "Salesforce Metadata" }),
    workItem({ key: "R", created: "2026-09-01T00:00:00Z", status: "done", risk: "P0" }),
  ];

  it("maps meaningful changes and filters noise, newest first", () => {
    const events = [
      ev.status("A", "2026-10-02T09:00:00Z", "todo", "progress"),
      ev.status("A", "2026-10-03T09:00:00Z", "progress", "done"),
      ev.status("A", "2026-10-04T09:00:00Z", "done", "progress"),
      ev.status("A", "2026-10-04T10:00:00Z", "progress", "progress"),
      ev.status("A", "2026-10-04T11:00:00Z", "progress", "review"),
      ev.sprint("A", "2026-10-05T09:00:00Z", [], [10]),
      ev.sprint("A", "2026-10-05T10:00:00Z", [10], []),
      ev.assignee("A", "2026-10-06T09:00:00Z", "Sam Chen"),
      ev.points("A", "2026-10-06T10:00:00Z", null, 3),
      ev.priority("A", "2026-10-06T11:00:00Z", "Medium", "High"),
      ev.labels("A", "2026-10-06T12:00:00Z"),
      ev.other("A", "2026-10-06T13:00:00Z"),
      ev.status("R", "2026-10-07T09:00:00Z", "todo", "done"),
      ev.status("A", "2026-08-01T09:00:00Z", "todo", "progress"),
    ];
    const activity = buildRecentActivity(timelines(items, events), activityCtx);
    expect(activity.map((a) => [a.type, a.title])).toEqual([
      ["risk_resolved", expect.stringMatching(/^P0 risk I-0\d resolved$/)],
      ["priority_changed", "A priority changed"],
      ["estimate_changed", "A estimate changed"],
      ["assignee_changed", "A assigned to Sam Chen"],
      ["sprint_removed", "A removed from MIG S1 - Discovery"],
      ["sprint_added", "A added to MIG S1 - Discovery"],
      ["reopened", "A reopened"],
      ["completed", "A completed"],
      ["started", "A moved to In Progress"],
    ]);
    expect(activity.find((a) => a.type === "estimate_changed")?.description).toBe("none → 3 story points");
    expect(activity[1]).toMatchObject({ issueSummary: "Salesforce Metadata", actorDisplayName: "Alex Rivera", jiraUrl: "https://site.example/browse/A" });
    expect(JSON.stringify(activity)).not.toMatch(/@|accountId/);
  });

  it("limits to 20 events and uses 'Jira user' for unknown actors", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      ...ev.assignee("A", `2026-10-0${1 + (i % 8)}T${String(10 + (i % 10)).padStart(2, "0")}:00:00Z`, `Person ${i}`),
      actor: null,
    }));
    const activity = buildRecentActivity(timelines(items, many), activityCtx);
    expect(activity).toHaveLength(20);
    expect(activity.every((a) => a.actorDisplayName === "Jira user")).toBe(true);
  });
});

describe("activity grouping", () => {
  it("groups a sprint-planning batch (same person, same sprint, ≤ 15 min) into one event", () => {
    const NOW = new Date("2026-10-09T12:00:00Z");
    const items = ["P", "Q", "R", "S"].map((key) => workItem({ key, created: "2026-10-01T00:00:00Z", sprintIds: [10] }));
    const events = [
      ev.sprint("P", "2026-10-03T07:17:00Z", [], [10]),
      ev.sprint("Q", "2026-10-03T07:17:20Z", [], [10]),
      ev.sprint("R", "2026-10-03T07:20:00Z", [], [10]),
      ev.sprint("S", "2026-10-03T09:00:00Z", [], [10]), // > 15 min later → separate
    ];
    const activity = buildRecentActivity(timelines(items, events), {
      now: NOW,
      catalog: CATALOG,
      sprintNameById: new Map([[10, "MIG S2 - Schema Mapping"]]),
      issueUrl: (key) => `https://site.example/browse/${key}`,
    });
    expect(activity.map((a) => [a.title, a.issueKeys, a.jiraUrl])).toEqual([
      ["S added to MIG S2 - Schema Mapping", ["S"], "https://site.example/browse/S"],
      ["3 work items added to MIG S2 - Schema Mapping", ["P", "Q", "R"], null],
    ]);
  });
});
