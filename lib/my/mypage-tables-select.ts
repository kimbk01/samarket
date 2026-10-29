/** `my_page_banners` — `MyPageBannerRow` */
export const MY_PAGE_BANNERS_SELECT =
  "id, title, description, image_url, link_url, is_active, dismissible, sort_order, created_at, updated_at";

/** `my_services` — `MyServiceRow` */
export const MY_SERVICES_SELECT = "code, label, icon_key, href, is_active, sort_order, admin_only, country_code";

/** `my_page_sections` — `MyPageSectionRow` */
export const MY_PAGE_SECTIONS_SELECT = "section_key, title, is_active, sort_order";

/**
 * 마이페이지 배너 노출 기간 조건 (감사 AD-05) — 관리자가 입력한 시작·종료 시각을 고객 조회에도 적용한다.
 * `is_active`(= 상태 노출) 와 함께 쓴다. 종료 시각과 같은 순간은 노출하지 않는다 (피드 배너 리졸버와 같은 규칙).
 */
export function myPageBannerLiveWindowFilters(nowIso: string): { startOr: string; endOr: string } {
  return {
    startOr: `start_at.is.null,start_at.lte.${nowIso}`,
    endOr: `end_at.is.null,end_at.gt.${nowIso}`,
  };
}
