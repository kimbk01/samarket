/**
 * Philife/Community 레거시 export.
 * 신규 UI 규격은 전역 `Sam` 디자인 시스템(`sam-*`)만 사용한다.
 */
export const COMMUNITY_FONT_CLASS = "font-sans antialiased";

/** Samarket 서비스 팔레트 */
export const COMMUNITY_COLOR_PRIMARY = "var(--sam-primary)";
export const COMMUNITY_COLOR_PRIMARY_STRONG = "var(--sam-primary-hover)";
export const COMMUNITY_COLOR_PRIMARY_SOFT = "var(--sam-primary-soft)";
export const COMMUNITY_COLOR_TEXT_MAIN = "var(--sam-text-primary)";
export const COMMUNITY_COLOR_TEXT_SUB = "var(--sam-text-secondary)";
export const COMMUNITY_COLOR_TEXT_MUTED = "var(--sam-text-muted)";
export const COMMUNITY_COLOR_BORDER = "var(--sam-border-default)";
export const COMMUNITY_COLOR_BG_PAGE = "var(--sam-bg-app)";
export const COMMUNITY_COLOR_BG_CARD = "var(--sam-bg-surface)";
export const COMMUNITY_COLOR_DANGER = "var(--sam-danger)";
export const COMMUNITY_COLOR_SUCCESS = "var(--sam-success)";

/** 타이포 스케일 */
export const COMMUNITY_TYPO_PAGE_TITLE = "sam-text-page-title";
export const COMMUNITY_TYPO_SECTION_TITLE = "sam-text-section-title";
export const COMMUNITY_TYPO_CARD_TITLE = "sam-text-card-title";
export const COMMUNITY_TYPO_BODY = "sam-text-body";
export const COMMUNITY_TYPO_BODY_COMPACT = "sam-text-body-secondary";
export const COMMUNITY_TYPO_META = "sam-text-helper";
export const COMMUNITY_TYPO_CAPTION = "sam-text-xxs";
export const COMMUNITY_TYPO_BUTTON = "sam-text-body font-medium";
export const COMMUNITY_TYPO_TAB = "sam-tab";
export const COMMUNITY_TYPO_MODAL_TITLE = "sam-text-page-title";
export const COMMUNITY_TYPO_MODAL_BODY = "sam-text-body";

/** 피드·작성 등 페이지 루트 */
export const PHILIFE_PAGE_ROOT_CLASS = [
  "min-h-screen min-w-0 max-w-full overflow-x-hidden pb-28",
  COMMUNITY_FONT_CLASS,
  "bg-sam-app text-sam-fg",
].join(" ");

/** /philife·/home 공통 — 리스트 영역 좌우 인셋(가로) — `HomeContent`와 `PHILIFE_FEED_LIST` 정렬 */
export const PHILIFE_FEED_INSET_X_CLASS = "px-2";

/** `PHILIFE_FEED_INSET_X_CLASS` 부모 안에서 가로 풀폭까지 늘리기(스티키 탭 등) */
export const PHILIFE_FEED_INSET_NEG_X_CLASS = "-mx-2";

/** 피드 글 목록 바깥 래퍼 — 카드 간격 (`<ul>` 용) */
export const PHILIFE_FEED_LIST_WRAP_CLASS = `m-0 list-none space-y-1 p-0 ${PHILIFE_FEED_INSET_X_CLASS} pt-1 pb-1 [&>li]:list-none`;

/** 피드/광고 카드 공통 */
export const PHILIFE_FB_CARD_CLASS =
  "sam-card";

/** 보조 메타 텍스트 */
export const PHILIFE_FB_META_SECONDARY_CLASS = "sam-text-helper";

/** placeholder·더 약한 힌트 */
export const PHILIFE_FB_PLACEHOLDER_TONE_CLASS =
  "placeholder:text-sam-meta";

/** 입력 필드 (댓글·검색 느낌) */
export const PHILIFE_FB_INPUT_CLASS = "sam-input";

/** 글쓰기 본문 등 멀티라인 */
export const PHILIFE_FB_TEXTAREA_CLASS = "sam-textarea";

/** 버튼 variants */
export const COMMUNITY_BUTTON_PRIMARY_CLASS = "sam-btn-primary";
export const COMMUNITY_BUTTON_SECONDARY_CLASS = "sam-btn-secondary";
export const COMMUNITY_BUTTON_GHOST_CLASS = "sam-btn-ghost";
export const COMMUNITY_BUTTON_DANGER_CLASS = "sam-btn-danger";

/** 탭/칩/배지 */
export const COMMUNITY_TAB_BASE_CLASS =
  "sam-tab";
export const COMMUNITY_TAB_ACTIVE_CLASS = `${COMMUNITY_TAB_BASE_CLASS} sam-tab--active`;
export const COMMUNITY_TAB_IDLE_CLASS = COMMUNITY_TAB_BASE_CLASS;
export const COMMUNITY_CHIP_CLASS =
  "sam-chip";

/** 오버레이/모달/드롭다운/시트/토스트 */
export const COMMUNITY_OVERLAY_BACKDROP_CLASS = "fixed inset-0 z-40 bg-sam-ink/28 backdrop-blur-[1px]";
export const COMMUNITY_MODAL_PANEL_CLASS = "w-full max-w-md sam-card sam-card-pad";
export const COMMUNITY_BOTTOM_SHEET_PANEL_CLASS =
  "w-full rounded-t-sam-md border border-sam-border bg-sam-surface sam-card-pad shadow-none";
export const COMMUNITY_DROPDOWN_PANEL_CLASS =
  "rounded-sam-md border border-sam-border bg-sam-surface py-1 shadow-none";
export const COMMUNITY_TOAST_PANEL_CLASS =
  "rounded-sam-md border border-sam-border bg-sam-surface sam-card-pad-x py-2 sam-text-body-secondary shadow-none";

/** 글 상세 제목 */
export const PHILIFE_DETAIL_TITLE_CLASS =
  "mt-3 sam-text-page-title";

/** 본문 */
export const PHILIFE_DETAIL_BODY_CLASS =
  "mt-4 whitespace-pre-wrap sam-text-body";

/** 인터리브 본문 문단 */
export const PHILIFE_DETAIL_INTERLEAVED_TEXT_CLASS =
  "min-w-0 break-words whitespace-pre-wrap sam-text-body [word-spacing:normal]";

/** 메타 줄 */
export const PHILIFE_DETAIL_META_CLASS =
  "mt-2 flex flex-wrap gap-x-2 gap-y-1 sam-text-helper";

/** 이웃만 보기 등 보조 필터 */
export const PHILIFE_FEED_FILTER_STRIP_CLASS =
  "border-b border-sam-border bg-sam-surface py-2";

/** 상세 본문·툴바 묶음 */
export const PHILIFE_DETAIL_POST_SLAB_CLASS =
  "overflow-hidden border-b border-sam-border bg-sam-surface";

/** 댓글 블록 */
export const PHILIFE_DETAIL_COMMENTS_WRAP_CLASS =
  "border-t border-sam-border bg-sam-surface pb-4 pt-4";

/** 상세 페이지 바깥 컨테이너 (CommunityDetail) */
export const PHILIFE_DETAIL_PAGE_ROOT_CLASS = [
  "min-h-screen bg-sam-app",
  COMMUNITY_FONT_CLASS,
].join(" ");

