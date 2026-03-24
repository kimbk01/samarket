/**
 * 48단계: QA 요약 (mustPass failed/blocked → no_go)
 */

import { getQaTestCases } from "./mock-qa-test-cases";
import { getQaPilotChecks } from "./mock-qa-pilot-checks";
import { getOpenCriticalIssues } from "./mock-qa-issue-logs";
import type { QaSummary, QaGoLiveDecision } from "@/lib/types/qa-board";

export function getQaSummary(): QaSummary {
  const cases = getQaTestCases();
  const totalCases = cases.length;
  const passedCases = cases.filter((c) => c.status === "passed").length;
  const failedCases = cases.filter((c) => c.status === "failed").length;
  const blockedCases = cases.filter((c) => c.status === "blocked").length;

  const mustPassCases = cases.filter((c) => c.isMustPass);
  const mustPassTotal = mustPassCases.length;
  const mustPassPassed = mustPassCases.filter((c) => c.status === "passed").length;
  const mustPassFailedOrBlocked = mustPassCases.some(
    (c) => c.status === "failed" || c.status === "blocked"
  );

  const criticalOpen = getOpenCriticalIssues().length;
  const pilotChecks = getQaPilotChecks();
  const pilotDoneCount = pilotChecks.filter((c) => c.status === "done").length;
  const pilotTotalCount = pilotChecks.length;

  let goLiveQaDecision: QaGoLiveDecision = "no_go";
  if (mustPassFailedOrBlocked || criticalOpen > 0) goLiveQaDecision = "no_go";
  else if (mustPassPassed === mustPassTotal && failedCases === 0 && blockedCases === 0)
    goLiveQaDecision = "go";
  else goLiveQaDecision = "conditional_go";

  const allUpdated = [
    ...cases.map((c) => c.updatedAt),
    ...pilotChecks.map((c) => c.updatedAt),
  ];
  const latestUpdatedAt =
    allUpdated.length > 0
      ? allUpdated.reduce((max, d) => (d > max ? d : max), allUpdated[0])
      : null;

  return {
    totalCases,
    passedCases,
    failedCases,
    blockedCases,
    criticalOpenIssues: criticalOpen,
    mustPassTotal,
    mustPassPassed,
    pilotDoneCount,
    pilotTotalCount,
    goLiveQaDecision,
    latestUpdatedAt,
  };
}
