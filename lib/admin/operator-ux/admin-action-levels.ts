/**
 * 관리자 동작 → 확인 단계 SSOT (수정 계획 2-3 · 재설계 R2).
 * 화면은 `confirmAdminAction({ level: adminActionLevel("approve"), … })` 처럼 동작 종류로 단계를 정한다 — 같은 동작은 어디서나 같은 단계.
 *
 * L0 확인 없음 — 조회·필터·새로고침·상세 (이 표에 넣지 않는다)
 * L1 확인 1회 — 되돌릴 수 있는 변경 (저장·보류·노출 중지·사용 끄기)
 * L2 확인 + 사유(2자 이상) + 감사 기록 — 회원 영향·금전이 걸린 변경 (승인·반려·제재·노출 시작·지급)
 * L3 확인 + 사유 + 대상 재입력 + 감사 기록 — 되돌릴 수 없거나 대량 (삭제·환불·만료 실행·일괄·긴급 차단·초기화)
 *
 * L2·L3 의 사유는 **반드시 변경 API 로 보내고 서버가 감사 기록에 남긴다** (확인창에서만 받고 버리지 않는다).
 */

import type { AdminConfirmLevel } from "@/lib/admin/operator-ux/admin-confirm-action";

export const ADMIN_ACTION_LEVELS = {
  // L1 — 되돌릴 수 있는 변경
  save: "L1",
  hold: "L1",
  exposeStop: "L1",
  disable: "L1",
  resume: "L1",
  // L2 — 회원 영향·금전
  approve: "L2",
  reject: "L2",
  sanction: "L2",
  liftSanction: "L2",
  exposeStart: "L2",
  payout: "L2",
  moneyApprove: "L2",
  pointPolicySave: "L2",
  // L3 — 되돌릴 수 없음·대량
  delete: "L3",
  purge: "L3",
  refund: "L3",
  forceCancel: "L3",
  expireRun: "L3",
  bulk: "L3",
  emergencyBlock: "L3",
  dataReset: "L3",
  /** 포인트 실지급 — 지급(L2)이지만 V3-07 「닉네임 지급액」 재입력을 유지한다 (기존 보호 장치를 낮추지 않는다). */
  realPointGrant: "L3",
} as const satisfies Record<string, AdminConfirmLevel>;

export type AdminActionKind = keyof typeof ADMIN_ACTION_LEVELS;

export function adminActionLevel(kind: AdminActionKind): AdminConfirmLevel {
  return ADMIN_ACTION_LEVELS[kind];
}

/** L2·L3 — 사유를 API 로 보내야 하는 단계. */
export function adminActionRequiresReason(kind: AdminActionKind): boolean {
  return ADMIN_ACTION_LEVELS[kind] !== "L1";
}
