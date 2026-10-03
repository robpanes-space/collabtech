---
name: typescript-quality
description: TypeScript standards for this repo — strict mode, Zod validation of Jira responses, typed domain entities and DTOs, pure metric functions, typed errors. Use when writing or reviewing any TypeScript.
---

# TypeScript quality

- `strict: true` (plus `noUncheckedIndexedAccess`). `npm run typecheck` must pass.
- No `any`. Use `unknown` + Zod parsing at the boundary. `as` casts need a comment justifying them.
- **Raw Jira responses** validated with Zod schemas in `src/lib/jira/schemas.ts`.
  Schemas use `.passthrough()`/loose objects only where Jira adds fields; required fields
  we depend on are required in the schema.
- **Normalized entities** (`src/lib/jira/types.ts`): plain, serializable, `null` for missing
  (not `undefined`), ISO strings for dates.
- **Dashboard DTOs** (`src/lib/dashboard/types.ts`, type-only): what route handlers return and components
  consume. No raw Jira types here.
- **Metric functions**: pure, deterministic, no I/O, no `Date.now()` (accept `now`),
  return `number | null` for ratios.
- **Errors**: `JiraApiError` with a discriminated `code` union; handle with `switch` on code.
- Prefer `type` aliases and discriminated unions; export types from the layer that owns them.
- Server-only modules start with `import "server-only";`.
