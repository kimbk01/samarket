/**
 * 포인트 Admin 상태 라벨 (재설계 R5 · 상태 라벨) — 포인트 충전 신청·지급 실행·소멸 실행 상태를 운영자 문구로.
 * 화면은 이 파일을 import(부수효과)한 뒤 `<AdminStatusLabel namespace={POINTS_…_NS} code={…} ko={ko} />`
 * 또는 `adminStatusLabelText(POINTS_…_NS, code, ko)` 로 그린다. 미등록 코드 = 「알 수 없는 상태」(원문은 기술 정보).
 * Client-safe (DB·서버 모듈 import 없음).
 */

import { registerAdminStatusLabels } from "@/lib/admin/status-labels/admin-status-label-registry";
import { catalogPair } from "@/lib/i18n/catalog-pair";

/** 포인트 충전 신청 상태 — `point_charge_requests.request_status` (`PointChargeRequestStatus`). */
export const POINTS_CHARGE_STATUS_NS = "points.charge";
registerAdminStatusLabels(POINTS_CHARGE_STATUS_NS, {
  pending: { ...catalogPair("admin_pending_5"), tone: "info" },
  waiting_confirm: { ...catalogPair("admin_awaiting_confirmation"), tone: "warning" },
  on_hold: { ...catalogPair("admin_on_hold"), tone: "warning" },
  approved: { ...catalogPair("admin_approved"), tone: "success" },
  rejected: { ...catalogPair("admin_rejected"), tone: "danger" },
  cancelled: { ...catalogPair("admin_cancelled_6"), tone: "neutral" },
});

/** 포인트 지급 실행 결과 — `point_reward_executions.status` (`PointRewardExecutionStatus`). */
export const POINTS_EXECUTION_STATUS_NS = "points.execution";
registerAdminStatusLabels(POINTS_EXECUTION_STATUS_NS, {
  success: { ...catalogPair("admin_granted"), tone: "success" },
  blocked: { ...catalogPair("admin_blocked_2"), tone: "warning" },
  reversed: { ...catalogPair("admin_reversed"), tone: "neutral" },
});

/** 포인트 소멸 실행 결과 — `point_expire_executions.execution_status` (`PointExpireExecutionStatus`). */
export const POINTS_EXPIRE_STATUS_NS = "points.expire";
registerAdminStatusLabels(POINTS_EXPIRE_STATUS_NS, {
  simulated: { ...catalogPair("admin_simulated"), tone: "info" },
  success: { ...catalogPair("admin_expired_2"), tone: "success" },
  skipped: { ...catalogPair("admin_skipped"), tone: "neutral" },
  failed: { ...catalogPair("admin_meeting_engine_err_generic"), tone: "danger" },
});
