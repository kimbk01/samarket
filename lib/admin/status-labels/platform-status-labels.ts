/**
 * 플랫폼 운영 워크스페이스 상태 라벨 (UI/UX/CTA 표준 · 상태 라벨) — 원시 코드를 화면에 그대로 쓰지 않는다.
 * 화면은 이 파일을 import(부수효과)한 뒤 `<AdminStatusLabel namespace="platform.…" code={…} ko={ko} />` 로 그린다.
 * Client-safe.
 */

import { registerAdminStatusLabels } from "@/lib/admin/status-labels/admin-status-label-registry";

export const PLATFORM_REC_EXECUTION_NS = "platform.recExecution";
export const PLATFORM_REC_DEPLOYMENT_NS = "platform.recDeployment";

/** 추천 자동화 실행 결과 (`AutomationExecutionStatus`) */
registerAdminStatusLabels(PLATFORM_REC_EXECUTION_NS, {
  success: { ko: "성공", en: "Success", tone: "success" },
  skipped: { ko: "건너뜀", en: "Skipped", tone: "neutral" },
  failed: { ko: "실패", en: "Failed", tone: "danger" },
});

/** 추천 배포 상태 (`DeploymentStatus`) */
registerAdminStatusLabels(PLATFORM_REC_DEPLOYMENT_NS, {
  scheduled: { ko: "예약됨", en: "Scheduled", tone: "neutral" },
  deploying: { ko: "배포 중", en: "Deploying", tone: "info" },
  success: { ko: "성공", en: "Success", tone: "success" },
  rolled_back: { ko: "롤백됨", en: "Rolled back", tone: "warning" },
  failed: { ko: "실패", en: "Failed", tone: "danger" },
});
