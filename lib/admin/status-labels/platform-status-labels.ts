/**
 * 플랫폼 운영 워크스페이스 상태 라벨 (UI/UX/CTA 표준 · 상태 라벨) — 원시 코드를 화면에 그대로 쓰지 않는다.
 * 화면은 이 파일을 import(부수효과)한 뒤 `<AdminStatusLabel namespace="platform.…" code={…} ko={ko} />` 로 그린다.
 * Client-safe.
 */

import { registerAdminStatusLabels } from "@/lib/admin/status-labels/admin-status-label-registry";
import { catalogPair } from "@/lib/i18n/catalog-pair";

export const PLATFORM_REC_EXECUTION_NS = "platform.recExecution";
export const PLATFORM_REC_DEPLOYMENT_NS = "platform.recDeployment";

/** 추천 자동화 실행 결과 (`AutomationExecutionStatus`) */
registerAdminStatusLabels(PLATFORM_REC_EXECUTION_NS, {
  success: { ...catalogPair("admin_del_alert_th_success"), tone: "success" },
  skipped: { ...catalogPair("admin_skipped"), tone: "neutral" },
  failed: { ...catalogPair("admin_meeting_engine_err_generic"), tone: "danger" },
});

/** 추천 배포 상태 (`DeploymentStatus`) */
registerAdminStatusLabels(PLATFORM_REC_DEPLOYMENT_NS, {
  scheduled: { ...catalogPair("admin_launch_intro_pill_scheduled"), tone: "neutral" },
  deploying: { ...catalogPair("admin_deploying"), tone: "info" },
  success: { ...catalogPair("admin_del_alert_th_success"), tone: "success" },
  rolled_back: { ...catalogPair("admin_rolled_back"), tone: "warning" },
  failed: { ...catalogPair("admin_meeting_engine_err_generic"), tone: "danger" },
});
