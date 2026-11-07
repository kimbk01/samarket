/**
 * 관리자 동작 → 확인 단계 SSOT (수정 계획 2-3 · 재설계 R2).
 * 화면은 `confirmAdminAction({ level: adminActionLevel("approve"), … })` 처럼 동작 종류로 단계를 정한다 — 같은 동작은 어디서나 같은 단계.
 *
 * L0 확인 없음 — 조회·필터·새로고침·상세 (이 표에 넣지 않는다)
 * L1 확인 1회 — 되돌릴 수 있는 변경 (저장·보류·노출 중지·사용 끄기)
 * L2 확인 + 사유(2자 이상) + 감사 기록 — 회원 영향·금전이 걸린 변경 (승인·반려·제재·노출 시작·지급)
 * L3 확인 + 사유 + 감사 기록 — 되돌릴 수 없거나 대량 (삭제·환불·만료 실행·일괄·긴급 차단·초기화)
 *    · 광고 밖(돈 직접 처리·회원 일괄 등): + 대상 재입력(retype) 을 그대로 쓴다.
 *    · **광고 조치(`ADMIN_AD_REASON_ONLY_ACTIONS`): 사유만 — 대상 재입력 없음** (Owner 「사유만 입력하면 바로 삭제.
 *      암호 같은 것(대상 재입력)을 입력하는 것은 맞지 않는다」 2026-11-07 · 설계 §3-1). 종료는 귀책·환급 미리보기가 실수를 막고,
 *      삭제는 「이력 › 삭제됨 › 삭제 취소」로 되돌린다. 11-03 설계(L3 = 사유 + 재입력)·AD-123(거래 종료 재입력)을 이 지시로 바꾼다.
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
  /** 광고가 아닌 화면의 다시 켜기(상품 판매·자동 조치 등) — 광고 재개는 `adResume`(L2). */
  resume: "L1",
  /** 배달 광고 「검수 시작」 — 상태만 바뀌고 되돌릴 수 있다 (AL-05). */
  reviewStart: "L1",
  // L2 — 회원 영향·금전
  approve: "L2",
  reject: "L2",
  sanction: "L2",
  liftSanction: "L2",
  exposeStart: "L2",
  payout: "L2",
  moneyApprove: "L2",
  pointPolicySave: "L2",
  /** 서비스 운영 설정 켜기·끄기 (런타임 설정 · 휴대폰 인증 서비스 등) — 회원 전체에 영향 */
  runtimeSettingChange: "L2",
  /**
   * 광고 운영 조치 (설계 §6 · FB-A05 · AD-103 · AL-04~06 · 2026-11-04 · SSOT §3-1 2026-11-07) — 상위노출·피드·팝업·PTR·배달·마이·인트로 모두 이 한 표.
   * 정지 = L2(사유) · 재개 = L2(사유) · 연장(유료·보상) = L2(사유) · 종료 = L3(사유 + 귀책 + 환급 미리보기 · 재입력 없음).
   */
  pause: "L2",
  adResume: "L2",
  extend: "L2",
  // L3 — 되돌릴 수 없음·대량
  delete: "L3",
  purge: "L3",
  refund: "L3",
  forceCancel: "L3",
  /** 광고 종료 (SSOT §3-1) — 사유 + 귀책 + 환급 미리보기. 재입력 없음 (광고 전용 동작). */
  end: "L3",
  /** 광고 삭제 (SSOT §3-1·§3-2) — 사유만. 상태에 따라 완전 삭제 / 삭제 표시 / 종료 + 삭제 표시. */
  adDelete: "L3",
  /** 광고 일괄 삭제 — 사유만 (개수 재입력 없음). */
  adBulkDelete: "L3",
  /** 광고 강제 종료 — 사유 + 귀책 + 환급 미리보기 (재입력 없음). */
  adForceEnd: "L3",
  /** 광고 삭제 취소 (A-2) — 삭제 표시만 되돌림. 사유 필수. */
  adUndelete: "L2",
  expireRun: "L3",
  bulk: "L3",
  emergencyBlock: "L3",
  dataReset: "L3",
  /** 앱 출시 「발송 확정」 (Owner 2026-11-05) — 구버전 회원 대량 인앱+푸시. 사유 + 대상 버전 재입력 + 감사 기록. */
  appReleaseNotify: "L3",
  /** 포인트 실지급 — 지급(L2)이지만 V3-07 「닉네임 지급액」 재입력을 유지한다 (기존 보호 장치를 낮추지 않는다). */
  realPointGrant: "L3",
  /** 매장 Coin·Cash 수동 조정 (super_admin · 사유·증빙 필수) — 금전 생성·차감이라 L3 유지. */
  storeBalanceCorrection: "L3",
} as const satisfies Record<string, AdminConfirmLevel>;

export type AdminActionKind = keyof typeof ADMIN_ACTION_LEVELS;

export function adminActionLevel(kind: AdminActionKind): AdminConfirmLevel {
  return ADMIN_ACTION_LEVELS[kind];
}

/**
 * 광고 조치 = 「사유만」 (대상 재입력 금지 · SSOT §3-1 · 2026-11-07).
 * `confirmAdminAction({ action })` 은 이 동작이면 `retypeValue` 를 넘겨도 재입력 칸을 띄우지 않는다.
 * 광고 밖 L3(`delete`·`bulk`·`purge`·`refund`·`forceCancel`·`realPointGrant`·`storeBalanceCorrection`·`appReleaseNotify` …)는
 * 재입력을 그대로 둔다 — 광고 화면은 범용 `delete`·`bulk`·`forceCancel` 대신 아래 광고 동작을 쓴다.
 */
export const ADMIN_AD_REASON_ONLY_ACTIONS = ["end", "adDelete", "adBulkDelete", "adForceEnd", "adUndelete"] as const satisfies readonly AdminActionKind[];

const AD_REASON_ONLY = new Set<string>(ADMIN_AD_REASON_ONLY_ACTIONS);

/** 이 동작에서 대상 재입력(retype)을 쓸 수 있는가 — 광고 조치는 false. */
export function adminActionAllowsRetype(kind: AdminActionKind): boolean {
  return ADMIN_ACTION_LEVELS[kind] === "L3" && !AD_REASON_ONLY.has(kind);
}

/** L2·L3 — 사유를 API 로 보내야 하는 단계. */
export function adminActionRequiresReason(kind: AdminActionKind): boolean {
  return ADMIN_ACTION_LEVELS[kind] !== "L1";
}
