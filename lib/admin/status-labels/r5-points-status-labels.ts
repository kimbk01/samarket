/**
 * 포인트 Admin 상태 라벨 (재설계 R5 · 상태 라벨) — 포인트 충전 신청·지급 실행·소멸 실행 상태를 운영자 문구로.
 * 화면은 이 파일을 import(부수효과)한 뒤 `<AdminStatusLabel namespace={POINTS_…_NS} code={…} ko={ko} />`
 * 또는 `adminStatusLabelText(POINTS_…_NS, code, ko)` 로 그린다. 미등록 코드 = 「알 수 없는 상태」(원문은 기술 정보).
 * Client-safe (DB·서버 모듈 import 없음).
 */

import { registerAdminStatusLabels } from "@/lib/admin/status-labels/admin-status-label-registry";

/** 포인트 충전 신청 상태 — `point_charge_requests.request_status` (`PointChargeRequestStatus`). */
export const POINTS_CHARGE_STATUS_NS = "points.charge";
registerAdminStatusLabels(POINTS_CHARGE_STATUS_NS, {
  pending: { ko: "신청 접수", en: "Pending", tone: "info" },
  waiting_confirm: { ko: "입금 확인 대기", en: "Awaiting confirmation", tone: "warning" },
  on_hold: { ko: "보류", en: "On hold", tone: "warning" },
  approved: { ko: "승인", en: "Approved", tone: "success" },
  rejected: { ko: "반려", en: "Rejected", tone: "danger" },
  cancelled: { ko: "취소됨", en: "Cancelled", tone: "neutral" },
});

/** 포인트 지급 실행 결과 — `point_reward_executions.status` (`PointRewardExecutionStatus`). */
export const POINTS_EXECUTION_STATUS_NS = "points.execution";
registerAdminStatusLabels(POINTS_EXECUTION_STATUS_NS, {
  success: { ko: "지급 완료", en: "Granted", tone: "success" },
  blocked: { ko: "지급 차단", en: "Blocked", tone: "warning" },
  reversed: { ko: "지급 회수", en: "Reversed", tone: "neutral" },
});

/** 포인트 소멸 실행 결과 — `point_expire_executions.execution_status` (`PointExpireExecutionStatus`). */
export const POINTS_EXPIRE_STATUS_NS = "points.expire";
registerAdminStatusLabels(POINTS_EXPIRE_STATUS_NS, {
  simulated: { ko: "모의 실행", en: "Simulated", tone: "info" },
  success: { ko: "소멸 완료", en: "Expired", tone: "success" },
  skipped: { ko: "건너뜀", en: "Skipped", tone: "neutral" },
  failed: { ko: "실패", en: "Failed", tone: "danger" },
});
