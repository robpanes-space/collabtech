import { z } from "zod";

/**
 * Raw Jira changelog shapes (POST /rest/api/3/changelog/bulkfetch). Unknown keys are stripped,
 * so author emails, avatar URLs, time zones etc. never leave this layer.
 */

/** Jira returns `created` as epoch milliseconds in bulk fetch (ISO strings elsewhere). */
const jiraInstant = z.union([z.number(), z.string()]);

export const changelogItemSchema = z.object({
  field: z.string(),
  fieldId: z.string().nullish(),
  fieldtype: z.string().nullish(),
  from: z.string().nullish(),
  fromString: z.string().nullish(),
  to: z.string().nullish(),
  toString: z.string().nullish(),
});

export const changeHistorySchema = z.object({
  id: z.string(),
  created: jiraInstant,
  author: z.object({ accountId: z.string().nullish(), displayName: z.string().nullish() }).nullish(),
  items: z.array(changelogItemSchema),
});

export const issueChangelogSchema = z.object({
  issueId: z.string(),
  changeHistories: z.array(changeHistorySchema),
});

export const bulkChangelogPageSchema = z.object({
  issueChangeLogs: z.array(issueChangelogSchema).default([]),
  nextPageToken: z.string().nullish(),
});

export const statusCatalogSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    statusCategory: z.object({ key: z.string().nullish() }).nullish(),
  }),
);

export type RawChangelogItem = z.infer<typeof changelogItemSchema>;
export type RawChangeHistory = z.infer<typeof changeHistorySchema>;
export type RawIssueChangelog = z.infer<typeof issueChangelogSchema>;
export type RawBulkChangelogPage = z.infer<typeof bulkChangelogPageSchema>;
export type RawStatusCatalog = z.infer<typeof statusCatalogSchema>;
