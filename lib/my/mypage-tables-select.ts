/** `my_page_banners` — `MyPageBannerRow` */
/** 광고 최종 점검: 어드민이 넣는 모바일 이미지(`mobile_image_url`)도 고객 화면이 쓴다 (`MyTopBanner`). */
export const MY_PAGE_BANNERS_SELECT =
  "id, title, description, image_url, mobile_image_url, link_url, is_active, dismissible, sort_order, created_at, updated_at";

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

/**
 * MB-A03 (Owner 「설계안대로」 2026-11-04): 「지금 고객에게 보이는 마이 배너」 조건 1개 — 고객 조회(`loadMypageHomeBannersServer`·
 * `loadMypageCmsPack`)와 공통 광고 화면 숫자(`/api/admin/advertising/other-surfaces`)가 같이 쓴다.
 * `is_active = true` + 시작 ≤ 지금 + 지금 < 종료(종료 순간 제외).
 */
export function myPageBannerLiveQuerySpec(nowIso: string): {
  activeColumn: "is_active";
  activeValue: true;
  startOr: string;
  endOr: string;
} {
  const w = myPageBannerLiveWindowFilters(nowIso);
  return { activeColumn: "is_active", activeValue: true, startOr: w.startOr, endOr: w.endOr };
}

/**
 * MB-C04: 고객 조회 정렬 = 어드민 목록(`listAdminBanners`)과 같은 순서 — priority → sort_order → created_at 최신순.
 */
export const MY_PAGE_BANNER_CUSTOMER_ORDER: ReadonlyArray<{ column: "priority" | "sort_order" | "created_at"; ascending: boolean }> = [
  { column: "priority", ascending: true },
  { column: "sort_order", ascending: true },
  { column: "created_at", ascending: false },
];

/** 정렬 비교(시험·클라이언트 보조용) — `MY_PAGE_BANNER_CUSTOMER_ORDER` 와 같은 순서 */
export function compareMyPageBannersForCustomer(
  a: { priority?: number | null; sort_order?: number | null; created_at?: string | null },
  b: { priority?: number | null; sort_order?: number | null; created_at?: string | null }
): number {
  const pa = Number(a.priority ?? 0);
  const pb = Number(b.priority ?? 0);
  if (pa !== pb) return pa - pb;
  const sa = Number(a.sort_order ?? 0);
  const sb = Number(b.sort_order ?? 0);
  if (sa !== sb) return sa - sb;
  return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
}
