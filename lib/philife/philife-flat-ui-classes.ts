/**
 * Philife / `[data-community-flat-ui]` 공통 리듬 — 피드·상세·작성·FAB·탭을 한 곳에서 맞춘다.
 * (메신저 line 스킨과 동일한 플랫·sam 토큰 톤)
 */
import { BOTTOM_NAV_FAB_LAYOUT } from "@/lib/main-menu/bottom-nav-config";

/** 피드·작성 등 페이지 루트 */
export const PHILIFE_PAGE_ROOT_CLASS =
  "min-h-screen min-w-0 max-w-full overflow-x-hidden bg-sam-app pb-28";

/** 글 상세 제목 (피드 카드 제목과 동일 계열) */
export const PHILIFE_DETAIL_TITLE_CLASS =
  "mt-3 text-[18px] font-bold leading-snug tracking-tight text-sam-fg";

/** 본문 */
export const PHILIFE_DETAIL_BODY_CLASS =
  "mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-sam-fg";

/** 메타 줄 */
export const PHILIFE_DETAIL_META_CLASS =
  "mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-sam-muted";

/** 주제 탭 바깥 줄 */
export const PHILIFE_TOPIC_TAB_STRIP_CLASS =
  "min-w-0 overflow-x-hidden border-b border-sam-border bg-sam-surface";

/** 주제 탭 — 선택 */
export const PHILIFE_TOPIC_TAB_ON_CLASS =
  "-mb-px flex h-11 min-w-0 shrink-0 items-center justify-center whitespace-nowrap border-b-2 border-signature px-3 text-center text-[14px] font-semibold text-sam-fg transition-colors";

/** 주제 탭 — 비선택 */
export const PHILIFE_TOPIC_TAB_OFF_CLASS =
  "-mb-px flex h-11 min-w-0 shrink-0 items-center justify-center whitespace-nowrap border-b-2 border-transparent px-3 text-center text-[14px] font-medium text-sam-muted transition-colors hover:text-sam-fg";

/** 이웃만 보기 등 보조 필터 */
export const PHILIFE_FEED_FILTER_STRIP_CLASS =
  "border-b border-sam-border bg-sam-surface-muted py-3";

/** 상세 본문·툴바 묶음 (카드·그림자 없음) */
export const PHILIFE_DETAIL_POST_SLAB_CLASS =
  "overflow-hidden border-b border-sam-border bg-sam-surface";

/** 댓글 블록 (상단 구분만) */
export const PHILIFE_DETAIL_COMMENTS_WRAP_CLASS =
  "border-t border-sam-border bg-sam-surface pb-4 pt-4";

/** 하단 글쓰기 FAB */
export function philifeFabComposeClass(): string {
  return [
    "kasama-quick-add fixed z-30 flex h-11 min-w-[5.25rem] items-center justify-center rounded-full",
    "bg-signature px-3.5 text-[14px] font-semibold text-white ring-1 ring-black/[0.06]",
    BOTTOM_NAV_FAB_LAYOUT.bottomOffsetClass,
    BOTTOM_NAV_FAB_LAYOUT.rightOffsetClass,
  ].join(" ");
}
