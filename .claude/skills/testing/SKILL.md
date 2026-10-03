---
name: testing
description: Testing expectations and patterns (Vitest) for Jira client, normalization, and dashboard metrics — mocks, fixtures, and required edge cases. Use when adding or reviewing tests.
---

# Testing

Runner: **Vitest** (`npm run test`). Tests live in `tests/jira/` and `tests/dashboard/`.
Fixtures live in `tests/**/fixtures/` and are the **only** place fake Jira data may exist.

`server-only` is aliased to an empty module in `vitest.config.ts` so server modules can be
imported in tests.

## Required coverage

- **Metric unit tests** — every function in `src/lib/dashboard/`.
- **Normalization tests** — raw fixture → domain object.
- **Jira API mock tests** — stub `global.fetch` (`vi.stubGlobal("fetch", ...)`), assert URL,
  auth header presence (never its value in snapshots), pagination loop, error mapping.
- **Missing fields** — no story-point field, no assignee, no priority, no parent.
- **Empty sprint** / **zero issues** — ratios return `null`, not `NaN`/`0`.
- **No story points** — method falls back to `"workItems"`.
- **API failure** — 401, 403, 404, 429 (+Retry-After), 500, timeout, malformed JSON.

## Patterns

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.stubEnv("JIRA_BASE_URL", "https://example.atlassian.net");
  vi.stubEnv("JIRA_EMAIL", "test@example.com");
  vi.stubEnv("JIRA_API_TOKEN", "test-token");
});
```

- Pass a fixed `now` to time-based metrics.
- Keep fixtures minimal; build them with small factory helpers.
