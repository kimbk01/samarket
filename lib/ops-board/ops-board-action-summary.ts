/**
 * 운영 보드 요약 — 체크리스트 완료율, 미완료·연체 액션 등.
 */

import type { OpsActionSummary } from "@/lib/types/ops-board";
import {
  getOpsDailyChecklistItems,
  getOpsActionItems,
  getOverdueActionItems,
  getOpsRetrospectives,
} from "@/lib/ops-board/ops-board-state";

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getOpsActionSummary(
  checklistDate?: string
): OpsActionSummary {
  const date = checklistDate ?? getTodayDate();
  const items = getOpsDailyChecklistItems(date);
  const doneOrSkipped = items.filter(
    (i) => i.status === "done" || i.status === "skipped"
  ).length;
  const checklistCompletionRate =
    items.length > 0 ? (doneOrSkipped / items.length) * 100 : 0;

  const allActions = getOpsActionItems();
  const openStatuses: readonly string[] = ["open", "planned", "in_progress"];
  const totalOpenActions = allActions.filter((a) => openStatuses.includes(a.status)).length;
  const overdueActions = getOverdueActionItems().length;
  const highPriorityOpenActions = allActions.filter(
    (a) =>
      openStatuses.includes(a.status) && (a.priority === "high" || a.priority === "critical")
  ).length;

  const retros = getOpsRetrospectives({ limit: 1 });
  const latestRetrospectiveAt = retros[0]?.createdAt ?? null;

  return {
    checklistCompletionRate,
    totalOpenActions,
    overdueActions,
    highPriorityOpenActions,
    latestRetrospectiveAt,
    todayChecklistCount: items.length,
  };
}
