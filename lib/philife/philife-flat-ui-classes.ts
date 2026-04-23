/**
 * Philife/Community Viber 스타일 토큰.
 * - 기능/구조는 유지하고 시각 규칙만 통일한다.
 * - 모바일 우선: 본문 14px, placeholder 13px, radius 4px 고정.
 */
import { BOTTOM_NAV_FAB_LAYOUT } from "@/lib/main-menu/bottom-nav-config";

/** 시스템 산세리프 */
export const COMMUNITY_FONT_CLASS =
  "font-sans antialiased [font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,Helvetica,Arial,sans-serif]";

/** Viber 팔레트 */
export const COMMUNITY_COLOR_PRIMARY = "#7360F2";
export const COMMUNITY_COLOR_PRIMARY_STRONG = "#5B46E8";
export const COMMUNITY_COLOR_PRIMARY_SOFT = "#F3F0FF";
export const COMMUNITY_COLOR_TEXT_MAIN = "#1F2430";
export const COMMUNITY_COLOR_TEXT_SUB = "#6B7280";
export const COMMUNITY_COLOR_TEXT_MUTED = "#9CA3AF";
export const COMMUNITY_COLOR_BORDER = "#E5E7EB";
export const COMMUNITY_COLOR_BG_PAGE = "#F7F8FA";
export const COMMUNITY_COLOR_BG_CARD = "#FFFFFF";
export const COMMUNITY_COLOR_DANGER = "#E25555";
export const COMMUNITY_COLOR_SUCCESS = "#1FA971";

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
  "bg-[#F7F8FA] text-[#1F2430]",
].join(" ");

/** 피드 글 목록 바깥 래퍼 — 카드 간격 (`<ul>` 용) */
export const PHILIFE_FEED_LIST_WRAP_CLASS = "m-0 list-none space-y-2 p-0 px-2 pt-2 pb-1 [&>li]:list-none";

/** 피드/광고 카드 공통 */
export const PHILIFE_FB_CARD_CLASS =
  "overflow-hidden rounded-[4px] border border-[#E5E7EB] bg-[#FFFFFF] shadow-[0_1px_2px_rgba(31,36,48,0.05)]";

/** 보조 메타 텍스트 */
export const PHILIFE_FB_META_SECONDARY_CLASS = "text-[12px] font-normal leading-[1.4] text-[#6B7280]";

/** placeholder·더 약한 힌트 */
export const PHILIFE_FB_PLACEHOLDER_TONE_CLASS =
  "placeholder:text-[13px] placeholder:font-normal placeholder:leading-[1.45] placeholder:text-[#9CA3AF]";

/** 입력 필드 (댓글·검색 느낌) */
export const PHILIFE_FB_INPUT_CLASS = [
  "h-11 rounded-[4px] border border-[#E5E7EB] bg-[#FFFFFF] px-3 text-[14px] font-normal leading-[1.5] text-[#1F2430] outline-none",
  PHILIFE_FB_PLACEHOLDER_TONE_CLASS,
  "focus:border-[#7360F2] focus:ring-1 focus:ring-[#7360F2]/20",
].join(" ");

/** 글쓰기 본문 등 멀티라인 */
export const PHILIFE_FB_TEXTAREA_CLASS = [
  "min-h-[96px] w-full resize-y rounded-[4px] border border-[#E5E7EB] bg-[#FFFFFF] px-3 py-2.5 text-[14px] font-normal leading-[1.5] text-[#1F2430] outline-none",
  PHILIFE_FB_PLACEHOLDER_TONE_CLASS,
  "focus:border-[#7360F2] focus:ring-1 focus:ring-[#7360F2]/20",
].join(" ");

/** 버튼 variants */
export const COMMUNITY_BUTTON_PRIMARY_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-[4px] bg-[#7360F2] px-3 py-2 text-[14px] font-semibold text-white transition hover:bg-[#5B46E8] disabled:opacity-40";
export const COMMUNITY_BUTTON_SECONDARY_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-[4px] border border-[#E5E7EB] bg-white px-3 py-2 text-[14px] font-semibold text-[#1F2430] transition hover:bg-[#F3F4F6] disabled:opacity-40";
export const COMMUNITY_BUTTON_GHOST_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-[4px] bg-transparent px-3 py-2 text-[14px] font-semibold text-[#1F2430] transition hover:bg-[#F3F4F6] disabled:opacity-40";
export const COMMUNITY_BUTTON_DANGER_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-[4px] bg-[#E25555] px-3 py-2 text-[14px] font-semibold text-white transition hover:opacity-95 disabled:opacity-40";

/** 탭/칩/배지 */
export const COMMUNITY_TAB_BASE_CLASS =
  "rounded-[4px] px-3 py-1.5 text-[13px] font-semibold transition-colors";
export const COMMUNITY_TAB_ACTIVE_CLASS = `${COMMUNITY_TAB_BASE_CLASS} bg-[#F3F0FF] text-[#7360F2]`;
export const COMMUNITY_TAB_IDLE_CLASS = `${COMMUNITY_TAB_BASE_CLASS} bg-[#FFFFFF] text-[#6B7280] hover:bg-[#F3F4F6]`;
export const COMMUNITY_CHIP_CLASS =
  "inline-flex items-center rounded-[4px] border border-[#E5E7EB] bg-[#F7F8FA] px-2 py-1 text-[11px] font-medium leading-[1.3] text-[#6B7280]";

/** 오버레이/모달/드롭다운/시트/토스트 */
export const COMMUNITY_OVERLAY_BACKDROP_CLASS = "fixed inset-0 z-40 bg-black/35";
export const COMMUNITY_MODAL_PANEL_CLASS =
  "w-full max-w-md rounded-[4px] border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_24px_rgba(31,36,48,0.14)]";
export const COMMUNITY_BOTTOM_SHEET_PANEL_CLASS =
  "w-full rounded-t-[4px] border border-[#E5E7EB] bg-white p-4 shadow-[0_-4px_18px_rgba(31,36,48,0.1)]";
export const COMMUNITY_DROPDOWN_PANEL_CLASS =
  "rounded-[4px] border border-[#E5E7EB] bg-white py-1 shadow-[0_8px_16px_rgba(31,36,48,0.1)]";
export const COMMUNITY_TOAST_PANEL_CLASS =
  "rounded-[4px] border border-[#E5E7EB] bg-white px-3 py-2 text-[13px] font-normal text-[#1F2430] shadow-[0_4px_12px_rgba(31,36,48,0.12)]";

/** 글 상세 제목 */
export const PHILIFE_DETAIL_TITLE_CLASS =
  "mt-3 text-[20px] font-bold leading-[1.3] tracking-tight text-[#1F2430]";

/** 본문 */
export const PHILIFE_DETAIL_BODY_CLASS =
  "mt-4 whitespace-pre-wrap text-[14px] font-normal leading-[1.5] text-[#1F2430]";

/** 인터리브 본문 문단 */
export const PHILIFE_DETAIL_INTERLEAVED_TEXT_CLASS =
  "min-w-0 break-words whitespace-pre-wrap text-[14px] font-normal leading-[1.5] text-[#1F2430] [word-spacing:normal]";

/** 메타 줄 */
export const PHILIFE_DETAIL_META_CLASS =
  "mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[12px] font-normal leading-[1.4] text-[#6B7280]";

/** 이웃만 보기 등 보조 필터 */
export const PHILIFE_FEED_FILTER_STRIP_CLASS =
  "border-b border-[#E5E7EB] bg-[#FFFFFF] py-2";

/** 상세 본문·툴바 묶음 */
export const PHILIFE_DETAIL_POST_SLAB_CLASS =
  "overflow-hidden border-b border-[#E5E7EB] bg-[#FFFFFF]";

/** 댓글 블록 */
export const PHILIFE_DETAIL_COMMENTS_WRAP_CLASS =
  "border-t border-[#E5E7EB] bg-[#FFFFFF] pb-4 pt-4";

/** 상세 페이지 바깥 컨테이너 (CommunityDetail) */
export const PHILIFE_DETAIL_PAGE_ROOT_CLASS = [
  "min-h-screen bg-[#F7F8FA]",
  COMMUNITY_FONT_CLASS,
].join(" ");

/**
 * 글쓰기 FAB — Viber 보라.
 */
export function philifeFabComposeClass(): string {
  return [
    "kasama-quick-add fixed z-[21] flex h-14 w-14 items-center justify-center rounded-[4px] border border-[#5B46E8] bg-[#7360F2] text-white shadow-[0_2px_8px_rgba(91,70,232,0.25)] transition active:scale-[0.98] active:opacity-95",
    BOTTOM_NAV_FAB_LAYOUT.bottomOffsetClass,
    BOTTOM_NAV_FAB_LAYOUT.rightOffsetClass,
  ].join(" ");
}
