---
name: dashboard-design
description: Visual and UX rules for the client-facing dashboard — layout, typography, colour, charts, KPI provenance, states. Use when building or reviewing any page or component.
---

# Dashboard design rules

**Goal:** a client understands project status in under 10 seconds.

## Principles

- Simple, executive-readable, modern SaaS. Minimal visual noise.
- Strong spacing, clear typography, muted neutral surfaces, subtle 1px borders.
- Status colour used sparingly and never alone (pair with icon/text).
  - done/healthy: green · in progress: blue · at-risk: amber · blocked/P0: red · neutral: zinc.
- P0 visibly more prominent than P1.
- Large KPI numbers (`text-3xl`+, tabular nums), small labels, small status badges.
- Cards only when they group meaningful information. Avoid "dozens of boxes".
- Desktop first, fully responsive (1 col mobile → 2 tablet → 3–6 desktop KPI grid).
- No gradients everywhere, heavy shadows, glassmorphism, or tiny type.

## KPI provenance

Every KPI shows a one-line provenance beneath the value:

```
Overall Progress   41%      Based on story points
Sprint Completion  6 / 9    Based on Jira work items
P0 Risks           2        Based on open issues labeled P0
```

## Charts (Recharts)

- A chart must answer a question. No decorative charts.
- Hide a chart (with a short note) rather than show misleading data (e.g. velocity w/o SP).
- Each chart has a title, `aria-label`, and a text summary for screen readers.
- Use consistent status colours; label axes; avoid legends when direct labels work.

## States

Each section: **loading** (skeleton matching final layout) · **empty** (plain-language
explanation) · **error** (friendly message + what to check) · **success**.

## Implementation (this repo)

- Color tokens live in `src/app/globals.css` (`--viz-*`, `--status-*`), validated with the dataviz
  palette validator: work status is a one-hue blue ordinal ramp (To Do → In Progress → Done);
  status colors are reserved for health/severity and always paired with an icon + text label.
- Shared chart styling: `src/components/charts/chart-kit.tsx` (axes, grid, tooltip shell,
  accessible `ChartFigure` with a text summary). Charts are the only client components besides
  nav, refresh, tooltips and risk filters.
- KPI mini visuals live in `src/components/dashboard/kpi-visuals.tsx` (`ProgressRing`, `CompositionBar`,
  `ShareBar`, `SegmentTrack`, `IconChip`). They take backend percentages or raw counts only — bar
  geometry uses counts via flex-grow, never a derived percentage. Always decorative (`aria-hidden`)
  beside visible value + provenance text.
- Pages load one `DashboardDto` via `loadDashboard()`; components never compute metrics —
  `src/lib/dashboard/selectors.ts` only selects DTO records.

## Language

Work Items, Milestone, Current Sprint, Completed, In Progress, Upcoming, Blocked, Risks,
Next Steps, Delivery Roadmap. Never show JQL, field IDs, or raw Jira errors.

## Navigation

Overview · Sprints · Risks. Nothing else.
