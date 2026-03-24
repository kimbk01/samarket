/**
 * 38단계: 체크리스트 생성, 회고→액션 생성 placeholder
 */

import type { OpsActionSourceType } from "@/lib/types/ops-board";
import { generateDailyChecklistFromTemplates } from "./mock-ops-daily-checklist-items";
import { addOpsActionItem } from "./mock-ops-action-items";

const ADMIN_ID = "admin1";
const ADMIN_NICK = "관리자";

/** 당일 체크리스트를 템플릿에서 생성 */
export function createTodayChecklist(
  checklistDate: string,
  adminId = ADMIN_ID,
  adminNickname = ADMIN_NICK
): ReturnType<typeof generateDailyChecklistFromTemplates> {
  return generateDailyChecklistFromTemplates(
    checklistDate,
    adminId,
    adminNickname
  );
}

/** 회고 nextActions에서 액션아이템 생성 placeholder (텍스트 파싱 없이 수동 생성용) */
export function createActionFromRetrospective(
  retrospectiveId: string,
  title: string,
  description: string,
  priority: "low" | "medium" | "high" | "critical" = "medium"
) {
  return addOpsActionItem({
    title,
    description,
    sourceType: "retrospective",
    sourceId: retrospectiveId,
    relatedSurface: "all",
    status: "open",
    priority,
    ownerAdminId: ADMIN_ID,
    ownerAdminNickname: ADMIN_NICK,
    dueDate: null,
    note: "",
  });
}

/** 브리핑/incident/report/deployment 연결 액션 생성 */
export function createActionFromSource(
  sourceType: OpsActionSourceType,
  sourceId: string | null,
  title: string,
  description: string,
  priority: "low" | "medium" | "high" | "critical" = "medium"
) {
  return addOpsActionItem({
    title,
    description,
    sourceType,
    sourceId,
    relatedSurface: "all",
    status: "open",
    priority,
    ownerAdminId: ADMIN_ID,
    ownerAdminNickname: ADMIN_NICK,
    dueDate: null,
    note: "",
  });
}
