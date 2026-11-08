
import { catalogPair } from "@/lib/i18n/catalog-pair";/**
 * Admin CTA 어휘 SSOT (수정 계획 2-1) — 같은 동작은 같은 단어. 화면 문구는 이 표에서만 가져온다.
 * 표 행 안 = 동사만(「승인」) · 헤더·상세 Drawer = 목적어+동사(「광고 승인」)는 호출부가 붙인다.
 * 금지 단어(`ADMIN_CTA_FORBIDDEN`)는 래칫 테스트가 표준 적용 화면에서 0건을 강제한다.
 * 클라이언트 안전.
 */

export const ADMIN_CTA = {
  search: catalogPair("admin_r4b_pay_search"),
  reset: catalogPair("admin_biz_ops_filter_reset"),
  refresh: catalogPair("admin_dash_v4_refresh"),
  save: catalogPair("admin_save"),
  cancel: catalogPair("admin_cancel"),
  create: catalogPair("admin_banners_submit_register"),
  edit: catalogPair("admin_banners_overview_edit"),
  approve: catalogPair("admin_meeting_engine_action_approve"),
  reject: catalogPair("admin_meeting_engine_action_reject"),
  hold: catalogPair("admin_delivery_ads_action_request_changes"),
  sanction: catalogPair("admin_sanction"),
  liftSanction: catalogPair("admin_lift_sanction"),
  exposeStart: catalogPair("admin_platform_popup_action_go_live"),
  exposeStop: catalogPair("admin_platform_popup_action_pause"),
  refund: catalogPair("admin_ops_console_focus_refund"),
  payout: catalogPair("admin_pay_out"),
  delete: catalogPair("admin_ad_delete_confirm"),
  exportCsv: catalogPair("admin_export_csv"),
  detail: catalogPair("admin_rel_action_detail"),
  close: catalogPair("admin_close"),
} as const;

export type AdminCtaKey = keyof typeof ADMIN_CTA;

export function adminCta(key: AdminCtaKey, ko: boolean): string {
  return ADMIN_CTA[key][ko ? "ko" : "en"];
}

/** 금지 단어 → 표준 단어. 래칫은 문자열 리터럴·JSX 텍스트로 쓰인 경우를 찾는다. */
export const ADMIN_CTA_FORBIDDEN: readonly { word: string; use: string }[] = [
  { word: "거절", use: "반려" },
  { word: "다시 시도", use: "새로고침" },
  { word: "재시도", use: "새로고침" },
  { word: "다시 불러오기", use: "새로고침" },
  { word: "리셋", use: "초기화" },
  { word: "엑셀", use: "CSV 내보내기" },
];

/** 단독 「검색」 버튼 금지 (검색 실행 = 「조회」). 「검색어」 같은 입력 라벨은 허용. */
export const ADMIN_CTA_FORBIDDEN_EXACT: readonly { word: string; use: string }[] = [
  { word: "검색", use: "조회" },
  { word: "확인", use: "동작 단어 (저장·승인 등)" },
];
