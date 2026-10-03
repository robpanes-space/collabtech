import { z } from "zod";

/**
 * Zod schemas for the raw Jira responses we depend on.
 * Unknown keys are stripped except on issue `fields`, where custom fields are needed.
 */

export const jiraUserSchema = z.object({
  accountId: z.string(),
  displayName: z.string().nullish(),
  active: z.boolean().nullish(),
});

export const jiraMyselfSchema = z.object({
  accountId: z.string(),
  displayName: z.string().nullish(),
  active: z.boolean().nullish(),
});

export const jiraProjectSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
});

export const jiraBoardSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.string(),
  location: z
    .object({
      projectKey: z.string().nullish(),
      projectName: z.string().nullish(),
    })
    .nullish(),
});

export const jiraBoardConfigurationSchema = z.object({
  id: z.number(),
  estimation: z
    .object({
      type: z.string().nullish(),
      field: z.object({ fieldId: z.string(), displayName: z.string().nullish() }).nullish(),
    })
    .nullish(),
});

export const jiraSprintStateSchema = z.enum(["active", "future", "closed"]);

export const jiraSprintSchema = z.object({
  id: z.number(),
  name: z.string(),
  state: jiraSprintStateSchema,
  goal: z.string().nullish(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  completeDate: z.string().nullish(),
  originBoardId: z.number().nullish(),
});

export const jiraSprintPageSchema = z.object({
  startAt: z.number().optional(),
  maxResults: z.number().optional(),
  isLast: z.boolean().optional(),
  values: z.array(jiraSprintSchema),
});

const statusCategorySchema = z.object({
  key: z.string().nullish(), // "new" | "indeterminate" | "done" (or "undefined" = no category)
  name: z.string().nullish(),
});

export const jiraStatusSchema = z.object({
  id: z.string().nullish(),
  name: z.string(),
  statusCategory: statusCategorySchema.nullish(),
});

const linkedIssueSchema = z.object({
  id: z.string(),
  key: z.string(),
  fields: z
    .object({
      summary: z.string().nullish(),
      status: jiraStatusSchema.nullish(),
      priority: z.object({ name: z.string() }).nullish(),
    })
    .nullish(),
});

export const jiraIssueLinkSchema = z.object({
  id: z.string().nullish(),
  type: z.object({ name: z.string(), inward: z.string(), outward: z.string() }),
  inwardIssue: linkedIssueSchema.nullish(),
  outwardIssue: linkedIssueSchema.nullish(),
});

export const jiraIssueFieldsSchema = z
  .object({
    summary: z.string(),
    issuetype: z.object({
      id: z.string().nullish(),
      name: z.string(),
      subtask: z.boolean().nullish(),
      hierarchyLevel: z.number().nullish(),
    }),
    status: jiraStatusSchema,
    assignee: jiraUserSchema.nullish(),
    priority: z.object({ id: z.string().nullish(), name: z.string() }).nullish(),
    labels: z.array(z.string()).nullish(),
    parent: z
      .object({
        id: z.string(),
        key: z.string(),
        fields: z
          .object({
            summary: z.string().nullish(),
            issuetype: z.object({ name: z.string(), hierarchyLevel: z.number().nullish() }).nullish(),
          })
          .nullish(),
      })
      .nullish(),
    issuelinks: z.array(jiraIssueLinkSchema).nullish(),
    // Timestamps are validated leniently; invalid values normalize to null.
    created: z.string().nullish(),
    updated: z.string().nullish(),
    resolutiondate: z.string().nullish(),
    duedate: z.string().nullish(),
    sprint: jiraSprintSchema.nullish(),
    closedSprints: z.array(jiraSprintSchema).nullish(),
  })
  // Custom fields (story points, epic link, flagged, ...) are resolved at normalization time.
  .catchall(z.unknown());

export const jiraIssueSchema = z.object({
  id: z.string(),
  key: z.string(),
  fields: jiraIssueFieldsSchema,
});

export const jiraIssuePageSchema = z.object({
  startAt: z.number().optional(),
  maxResults: z.number().optional(),
  total: z.number().optional(),
  issues: z.array(jiraIssueSchema),
});

export const jiraSearchJqlPageSchema = z.object({
  issues: z.array(jiraIssueSchema),
  nextPageToken: z.string().nullish(),
  isLast: z.boolean().nullish(),
});

export const jiraFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  custom: z.boolean(),
  schema: z.object({ type: z.string().nullish(), custom: z.string().nullish() }).nullish(),
});

export const jiraFieldListSchema = z.array(jiraFieldSchema);

export type RawJiraMyself = z.infer<typeof jiraMyselfSchema>;
export type RawJiraProject = z.infer<typeof jiraProjectSchema>;
export type RawJiraBoard = z.infer<typeof jiraBoardSchema>;
export type RawJiraBoardConfiguration = z.infer<typeof jiraBoardConfigurationSchema>;
export type RawJiraSprint = z.infer<typeof jiraSprintSchema>;
export type RawJiraSprintPage = z.infer<typeof jiraSprintPageSchema>;
export type RawJiraIssue = z.infer<typeof jiraIssueSchema>;
export type RawJiraIssuePage = z.infer<typeof jiraIssuePageSchema>;
export type RawJiraSearchJqlPage = z.infer<typeof jiraSearchJqlPageSchema>;
export type RawJiraField = z.infer<typeof jiraFieldSchema>;
