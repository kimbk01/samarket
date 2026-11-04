/**
 * 광고 ② 수정 설계 구현 (Owner 「설계안대로 구현」 2026-11-04) — 어드민 공통 문구. 뒤에 spread 되므로 같은 키는 이 파일 값이 우선한다.
 */
export const adsImpl1104AdminMessages = {
  ko: {
    // AD-009 · AD-304: 커뮤니티 메뉴 구역 「홍보」 → 「상위노출」 (admin-community-r4 의 같은 키를 덮어쓴다)
    admin_menu_community_section_promotion: "상위노출",
  },
  en: {
    admin_menu_community_section_promotion: "Top placement",
  },
} as const;
