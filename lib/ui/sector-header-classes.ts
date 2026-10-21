/** dibaY 공통 섹터 헤더 — `app/sector-header.css` 와 동기 */

export const SECTOR_HEADER_SHELL_CLASS = "sector-header-shell";
export const SECTOR_HEADER_SHELL_EMBEDDED_CLASS = "sector-header-shell--embedded";
export const SECTOR_HEADER_SHELL_FLAT_CLASS = "sector-header-shell--flat";
export const SECTOR_HEADER_BAR_WRAP_CLASS = "sector-header-bar-wrap";
export const SECTOR_HEADER_BAR_CLASS = "sector-header-bar";
export const SECTOR_HEADER_BAR_WITH_SUBTITLE_CLASS = "sector-header-bar--with-subtitle";
/** 메인 허브(제목 왼쪽) — 기존 허브 기하 유지 */
export const SECTOR_HEADER_BAR_LEFT_TITLE_CLASS = "sector-header-bar--left-title";
export const SECTOR_HEADER_BACK_CLASS = "sector-header-back";
export const SECTOR_HEADER_ACTION_CLASS = "sector-header-action";
export const SECTOR_HEADER_ACTION_PRIMARY_CLASS = "sector-header-action--primary";
export const SECTOR_HEADER_TITLE_CLASS = "sector-header-title";
export const SECTOR_HEADER_TITLE_LEFT_CLASS = "sector-header-title--left";
export const SECTOR_HEADER_TITLE_CLUSTER_CLASS = "sector-header-title-cluster";
export const SECTOR_HEADER_TITLE_CLUSTER_LEFT_CLASS = "sector-header-title-cluster--left";
export const SECTOR_HEADER_SUBTITLE_CLASS = "sector-header-subtitle";
export const SECTOR_HEADER_SEARCH_FIELD_CLASS = "sector-header-search-field";
export const SECTOR_HEADER_SEARCH_INPUT_CLASS = "sector-header-search-input";

/** standalone fixed 헤더 아래 본문 offset */
export const SECTOR_HEADER_MAIN_OFFSET_TOP_CLASS =
  "pt-[calc(var(--sector-header-h,52px)+var(--safe-top))]";

export const SECTOR_HEADER_CONTENT_TOP_PAD_CLASS = "pt-2";

/** 대칭 격자 좌·우 열 폭 CSS 변수 (`app/sector-header.css`) — `SectorHeaderBar` 가 행마다 실측값을 기록 */
export const SECTOR_HEADER_SIDE_VAR = "--sector-header-side";

/** 하위 화면 헤더 터치 영역 (뒤로·우측 아이콘 1개) — `--sector-header-touch` 와 동기 */
export const SECTOR_HEADER_TOUCH_PX = 48;

/**
 * 좌·우 슬롯 실측 폭(px) → 대칭 열 폭. 넓은 쪽이 기본 48px 이하이면 null(CSS 기본값 사용).
 * 예: 뒤로(48) · 우측 아이콘 2개(96) → 96 (양쪽 열 96px → 제목 화면 중앙).
 */
export function resolveSectorHeaderSideWidthPx(leftPx: number, rightPx: number): number | null {
  const l = Number.isFinite(leftPx) ? Math.max(0, leftPx) : 0;
  const r = Number.isFinite(rightPx) ? Math.max(0, rightPx) : 0;
  const widest = Math.ceil(Math.max(l, r));
  return widest > SECTOR_HEADER_TOUCH_PX ? widest : null;
}
