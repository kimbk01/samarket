/**
 * 49단계: 첫 주 관제 요약 (open/critical issue → stability status)
 */

import { getLaunchWeekChecklistItems } from "./mock-launch-week-checklist-items";
import { getLaunchWeekIssues } from "./mock-launch-week-issues";
import { getLaunchWeekKpis } from "./mock-launch-week-kpis";
import type {
  LaunchWeekSummary,
  LaunchWeekStabilityStatus,
  LaunchWeekDayNumber,
} from "@/lib/types/launch-week";

function getCurrentDayNumber(): LaunchWeekDayNumber {
  const d = new Date().getDate() % 7;
  return (d === 0 ? 7 : d) as LaunchWeekDayNumber;
}

export function getLaunchWeekSummary(): LaunchWeekSummary {
  const currentDay = getCurrentDayNumber();
  const checklistItems = getLaunchWeekChecklistItems();
  const totalChecklistCount = checklistItems.length;
  const totalChecklistDone = checklistItems.filter(
    (c) => c.status === "done"
  ).length;
  const blockedChecklistCount = checklistItems.filter(
    (c) => c.status === "blocked"
  ).length;

  const issues = getLaunchWeekIssues();
  const openIssueCount = issues.filter(
    (i) => !["resolved", "mitigated"].includes(i.status)
  ).length;
  const criticalIssueCount = issues.filter(
    (i) =>
      i.severity === "critical" &&
      !["resolved", "mitigated"].includes(i.status)
  ).length;

  const today = new Date().toISOString().slice(0, 10);
  const todayKpis = getLaunchWeekKpis({ observedDate: today });
  const fallbackToday = todayKpis[0]?.fallbackCount ?? 0;
  const killSwitchToday = todayKpis[0]?.killSwitchCount ?? 0;

  let currentStabilityStatus: LaunchWeekStabilityStatus = "normal";
  if (criticalIssueCount > 0 || killSwitchToday > 0) currentStabilityStatus = "critical";
  else if (openIssueCount >= 3 || blockedChecklistCount > 0)
    currentStabilityStatus = "warning";
  else if (openIssueCount >= 1 || fallbackToday > 0) currentStabilityStatus = "watch";

  const allUpdated = [
    ...checklistItems.map((c) => c.updatedAt),
    ...issues.map((i) => i.openedAt),
  ];
  const latestUpdatedAt =
    allUpdated.length > 0
      ? allUpdated.reduce((max, d) => (d > max ? d : max), allUpdated[0])
      : null;

  return {
    currentDay,
    currentStabilityStatus,
    openIssueCount,
    criticalIssueCount,
    blockedChecklistCount,
    fallbackToday,
    killSwitchToday,
    totalChecklistDone,
    totalChecklistCount,
    latestUpdatedAt,
  };
}
