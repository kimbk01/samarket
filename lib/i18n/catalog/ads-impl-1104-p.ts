/**
 * 광고 ② 수정 설계 구현 (Owner 「설계안대로 구현」 2026-11-04) — 상위노출·커뮤니티 문구. 뒤에 spread 되므로 같은 키는 이 파일 값이 우선한다.
 */
export const adsImpl1104PromotionMessages = {
  ko: {
    /** PB-54·AD-126: 상위노출 가격 저장 권한 없음 안내 */
    ads1104p_admin_boost_prices_write_denied: "저장할 권한이 없습니다 — {reason}",
    ads1104p_admin_write_denied_default: "이 작업을 할 권한이 없습니다.",
  },
  en: {
    ads1104p_admin_boost_prices_write_denied: "You can't save this — {reason}",
    ads1104p_admin_write_denied_default: "You don't have permission for this action.",
  },
} as const;
