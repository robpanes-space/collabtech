import "server-only";
import { getBoard, getSprintIssues, getSprints } from "./agile";
import { getJiraConfig } from "./config";
import { getProject, getProjectIssues, resolveSprintField, resolveStoryPointsField } from "./issues";
import { normalizeProjectData, type NormalizeOptions } from "./normalize";
import type { NormalizedProjectData } from "./types";

/**
 * Fetches everything the dashboard needs from Jira and normalizes it.
 * Errors propagate as JiraApiError; partial-failure handling belongs to the DTO layer.
 */
export async function loadNormalizedProjectData(now: Date = new Date()): Promise<NormalizedProjectData> {
  const config = getJiraConfig();

  // Stage 1 — independent requests in parallel.
  const [storyPoints, sprintField, project, board, sprints] = await Promise.all([
    resolveStoryPointsField(),
    resolveSprintField(),
    getProject(config.projectKey),
    getBoard(config.boardId),
    getSprints(config.boardId),
  ]);

  // Stage 2 — needs the resolved custom fields and sprint IDs. One paginated search for all
  // project issues plus one paginated request per sprint (never per issue).
  const extraFields = [storyPoints.fieldId, sprintField, config.riskField, config.epicLinkField].filter(
    (field): field is string => Boolean(field),
  );
  const [projectIssues, ...sprintIssueLists] = await Promise.all([
    getProjectIssues(extraFields),
    ...sprints.map((sprint) => getSprintIssues(sprint.id, extraFields)),
  ]);

  const options: NormalizeOptions = {
    storyPointsField: storyPoints.fieldId,
    riskField: config.riskField,
    epicLinkField: config.epicLinkField,
    blockedStatusNames: config.blockedStatusNames,
    sprintField,
  };

  return normalizeProjectData(
    {
      project,
      board,
      sprints,
      projectIssues,
      sprintIssues: Object.fromEntries(sprints.map((sprint, index) => [sprint.id, sprintIssueLists[index] ?? []])),
    },
    options,
    now,
  );
}
