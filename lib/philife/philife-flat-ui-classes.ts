/**
 * Philife/Community Viber 스타일 토큰.
 * - 기능/구조는 유지하고 시각 규칙만 통일한다.
 * - 모바일 우선: 본문 14px, placeholder 13px, radius 4px 고정.
 */
import { BOTTOM_NAV_FAB_LAYOUT } from "@/lib/main-menu/bottom-nav-config";

/** 시스템 산세리프 */
export const COMMUNITY_FONT_CLASS =
  "font-sans antialiased [font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,Helvetica,Arial,sans-serif]";

/** Samarket 서비스 팔레트 */
export const COMMUNITY_COLOR_PRIMARY = "#3F6FD9";
export const COMMUNITY_COLOR_PRIMARY_STRONG = "#315CC0";
export const COMMUNITY_COLOR_PRIMARY_SOFT = "#EEF4FF";
export const COMMUNITY_COLOR_TEXT_MAIN = "#1F2937";
export const COMMUNITY_COLOR_TEXT_SUB = "#667085";
export const COMMUNITY_COLOR_TEXT_MUTED = "#8A94A6";
export const COMMUNITY_COLOR_BORDER = "#D8DEE8";
export const COMMUNITY_COLOR_BG_PAGE = "#F4F5F7";
export const COMMUNITY_COLOR_BG_CARD = "#FFFFFF";
export const COMMUNITY_COLOR_DANGER = "#D45252";
export const COMMUNITY_COLOR_SUCCESS = "#21885D";

/** 타이포 스케일 */
export const COMMUNITY_TYPO_PAGE_TITLE = "text-[20px] font-bold leading-[1.3]";
export const COMMUNITY_TYPO_SECTION_TITLE = "text-[17px] font-bold leading-[1.35]";
export const COMMUNITY_TYPO_CARD_TITLE = "text-[15px] font-semibold leading-[1.4]";
export const COMMUNITY_TYPO_BODY = "text-[14px] font-normal leading-[1.5]";
export const COMMUNITY_TYPO_BODY_COMPACT = "text-[13px] font-normal leading-[1.45]";
export const COMMUNITY_TYPO_META = "text-[12px] font-normal leading-[1.4]";
export const COMMUNITY_TYPO_CAPTION = "text-[11px] font-medium leading-[1.3]";
export const COMMUNITY_TYPO_BUTTON = "text-[14px] font-semibold";
export const COMMUNITY_TYPO_TAB = "text-[13px] font-semibold";
export const COMMUNITY_TYPO_MODAL_TITLE = "text-[16px] font-bold leading-[1.35]";
export const COMMUNITY_TYPO_MODAL_BODY = "text-[14px] font-normal leading-[1.5]";

/** 피드·작성 등 페이지 루트 */
export const PHILIFE_PAGE_ROOT_CLASS = [
  "min-h-screen min-w-0 max-w-full overflow-x-hidden pb-28",
  COMMUNITY_FONT_CLASS,
  "bg-sam-app text-sam-fg",
].join(" ");

/** 피드 글 목록 바깥 래퍼 — 카드 간격 (`<ul>` 용) */
export const PHILIFE_FEED_LIST_WRAP_CLASS = "m-0 list-none space-y-2 p-0 px-2 pt-2 pb-1 [&>li]:list-none";

/** 피드/광고 카드 공통 */
export const PHILIFE_FB_CARD_CLASS =
  "overflow-hidden rounded-sam-md border border-sam-border bg-sam-surface shadow-sam-elevated";

/** 보조 메타 텍스트 */
export const PHILIFE_FB_META_SECONDARY_CLASS = "text-[12px] font-normal leading-[1.4] text-sam-muted";

/** placeholder·더 약한 힌트 */
export const PHILIFE_FB_PLACEHOLDER_TONE_CLASS =
  "placeholder:text-[14px] placeholder:font-normal placeholder:leading-[1.5] placeholder:text-sam-meta";

/** 입력 필드 (댓글·검색 느낌) */
export const PHILIFE_FB_INPUT_CLASS = [
  "h-[46px] rounded-sam-md border border-sam-border bg-sam-surface px-3.5 text-[15px] font-normal leading-[1.5] text-sam-fg outline-none transition-[border-color,box-shadow,background-color] duration-150",
  PHILIFE_FB_PLACEHOLDER_TONE_CLASS,
  "focus:border-sam-primary focus:ring-0 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--sam-primary)_18%,transparent)]",
].join(" ");

/** 글쓰기 본문 등 멀티라인 */
export const PHILIFE_FB_TEXTAREA_CLASS = [
  "min-h-[112px] w-full resize-y rounded-sam-md border border-sam-border bg-sam-surface px-3.5 py-3 text-[15px] font-normal leading-[1.5] text-sam-fg outline-none transition-[border-color,box-shadow,background-color] duration-150",
  PHILIFE_FB_PLACEHOLDER_TONE_CLASS,
  "focus:border-sam-primary focus:ring-0 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--sam-primary)_18%,transparent)]",
].join(" ");

/** 버튼 variants */
export const COMMUNITY_BUTTON_PRIMARY_CLASS =
  "inline-flex min-h-[46px] items-center justify-center rounded-sam-md border border-transparent bg-sam-primary px-4 py-2 text-[15px] font-semibold text-sam-on-primary transition active:bg-sam-primary-hover disabled:opacity-40";
export const COMMUNITY_BUTTON_SECONDARY_CLASS =
  "inline-flex min-h-[46px] items-center justify-center rounded-sam-md border border-sam-primary-border bg-sam-primary-soft px-4 py-2 text-[15px] font-semibold text-sam-primary transition active:brightness-[0.98] disabled:opacity-40";
export const COMMUNITY_BUTTON_GHOST_CLASS =
  "inline-flex min-h-[46px] items-center justify-center rounded-sam-md border border-transparent bg-transparent px-4 py-2 text-[15px] font-semibold text-sam-fg transition active:bg-sam-surface-muted disabled:opacity-40";
export const COMMUNITY_BUTTON_DANGER_CLASS =
  "inline-flex min-h-[46px] items-center justify-center rounded-sam-md border border-sam-danger/15 bg-sam-danger-soft px-4 py-2 text-[15px] font-semibold text-sam-danger transition active:opacity-95 disabled:opacity-40";

/** 탭/칩/배지 */
export const COMMUNITY_TAB_BASE_CLASS =
  "relative inline-flex min-h-[44px] items-center justify-center border-b-[3px] border-transparent px-4 py-2 text-[14px] font-medium transition-colors";
export const COMMUNITY_TAB_ACTIVE_CLASS = `${COMMUNITY_TAB_BASE_CLASS} border-sam-primary font-semibold text-sam-fg`;
export const COMMUNITY_TAB_IDLE_CLASS = `${COMMUNITY_TAB_BASE_CLASS} text-sam-muted`;
export const COMMUNITY_CHIP_CLASS =
  "inline-flex items-center rounded-sam-sm border border-sam-border bg-sam-surface px-2.5 py-1 text-[11px] font-medium leading-[1.3] text-sam-muted";

/** 오버레이/모달/드롭다운/시트/토스트 */
export const COMMUNITY_OVERLAY_BACKDROP_CLASS = "fixed inset-0 z-40 bg-sam-ink/28 backdrop-blur-[1px]";
export const COMMUNITY_MODAL_PANEL_CLASS =
  "w-full max-w-md rounded-sam-md border border-sam-border bg-sam-surface p-4 shadow-sam-elevated";
export const COMMUNITY_BOTTOM_SHEET_PANEL_CLASS =
  "w-full rounded-t-sam-md border border-sam-border bg-sam-surface p-4 shadow-sam-elevated";
export const COMMUNITY_DROPDOWN_PANEL_CLASS =
  "rounded-sam-md border border-sam-border bg-sam-surface py-1 shadow-sam-elevated";
export const COMMUNITY_TOAST_PANEL_CLASS =
  "rounded-sam-md border border-sam-border bg-sam-surface px-3 py-2 text-[13px] font-normal text-sam-fg shadow-sam-elevated";

/** 글 상세 제목 */
export const PHILIFE_DETAIL_TITLE_CLASS =
  "mt-3 text-[22px] font-bold leading-[1.3] tracking-tight text-sam-fg";

/** 본문 */
export const PHILIFE_DETAIL_BODY_CLASS =
  "mt-4 whitespace-pre-wrap text-[15px] font-normal leading-[1.6] text-sam-fg";

/** 인터리브 본문 문단 */
export const PHILIFE_DETAIL_INTERLEAVED_TEXT_CLASS =
  "min-w-0 break-words whitespace-pre-wrap text-[15px] font-normal leading-[1.6] text-sam-fg [word-spacing:normal]";

/** 메타 줄 */
export const PHILIFE_DETAIL_META_CLASS =
  "mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[12px] font-normal leading-[1.4] text-sam-muted";

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

/**
 * 글쓰기 FAB — Viber 보라.
 */
export function philifeFabComposeClass(): string {
  return [
    "kasama-quick-add fixed z-[21] flex h-14 w-14 items-center justify-center rounded-sam-md border border-sam-primary bg-sam-primary text-white shadow-sam-elevated transition active:scale-[0.98] active:opacity-95",
    BOTTOM_NAV_FAB_LAYOUT.bottomOffsetClass,
    BOTTOM_NAV_FAB_LAYOUT.rightOffsetClass,
  ].join(" ");
}
