/**
 * 결제·정산(finance) 워크스페이스 Admin 상태 라벨 (수정 계획 2장 「상태 라벨」).
 * 화면은 이 파일을 import(부수효과)한 뒤 `<AdminStatusLabel namespace="finance.*" code=… ko=… />` 로 그린다.
 * 원시 코드는 화면 1차 정보로 쓰지 않는다. Client-safe (DB·서버 모듈 import 없음).
 */

import { registerAdminStatusLabels } from "@/lib/admin/status-labels/admin-status-label-registry";

/** 사용/미사용 토글 — 포인트 플랜 `is_active` · Coin→Cash 전환 정책 `enabled` 등 불리언 상태. */
export const FINANCE_ACTIVE_STATE_NS = "finance.activeState";
registerAdminStatusLabels(FINANCE_ACTIVE_STATE_NS, {
  active: { ko: "사용 중", en: "Active", tone: "success" },
  inactive: { ko: "사용 안 함", en: "Inactive", tone: "neutral" },
});
