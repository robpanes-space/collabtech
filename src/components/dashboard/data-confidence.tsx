import { DataConfidenceLine } from "@/components/report/report-view";
import { loadDataConfidence } from "@/lib/readiness/readiness-service";
import { InfoHint } from "./primitives";

/**
 * Client-safe data-confidence signal (data completeness only — delivery risk is in the health
 * banner). Renders nothing if readiness cannot be computed; never exposes admin checks.
 */
export async function DataConfidenceStatus() {
  const confidence = await loadDataConfidence();
  if (!confidence) return null;
  return (
    <div className="flex items-center gap-1">
      <DataConfidenceLine confidence={confidence} />
      <InfoHint label="About data confidence">
        How complete the Jira data behind these numbers is (sprint schedule, estimates, milestone assignment, history).
        It does not measure delivery risk.
      </InfoHint>
    </div>
  );
}
