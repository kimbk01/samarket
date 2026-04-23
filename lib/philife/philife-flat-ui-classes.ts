/**
 * Philife 공통 리듬 — 피드·상세·작성·FAB·탭 클래스 상수.
 * 색·타이포는 전역 `design-tokens.css` / `samarket-components.css` 와 맞춘다.
 */
import { BOTTOM_NAV_FAB_LAYOUT } from "@/lib/main-menu/bottom-nav-config";

/** 피드·작성 등 페이지 루트 */
export const PHILIFE_PAGE_ROOT_CLASS =
  "min-h-screen min-w-0 max-w-full overflow-x-hidden bg-sam-app pb-28";

/** 글 상세 제목 (피드 카드 제목과 동일 계열) */
export const PHILIFE_DETAIL_TITLE_CLASS =
  "sam-text-page-title mt-3 leading-snug tracking-tight";

/** 본문 */
export const PHILIFE_DETAIL_BODY_CLASS = "sam-text-body mt-4 whitespace-pre-wrap leading-relaxed";

/**
 * 인터리브(이미지·문단 섞인) 본문의 **문단(텍스트) 조각** — `mt-4` 없음(컨테이너에 한 번만).
 */
export const PHILIFE_DETAIL_INTERLEAVED_TEXT_CLASS =
  "min-w-0 break-words sam-text-body whitespace-pre-wrap [word-spacing:normal]";

/** 메타 줄 */
export const PHILIFE_DETAIL_META_CLASS =
  "sam-text-helper mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sam-muted";

/** 이웃만 보기 등 보조 필터 — 2단과 톤 맞춤(같은 띠 색·촘촘한 보조 타이포) */
export const PHILIFE_FEED_FILTER_STRIP_CLASS =
  "border-b border-sam-border bg-sam-surface py-2";

/** 상세 본문·툴바 묶음 (카드·그림자 없음) */
export const PHILIFE_DETAIL_POST_SLAB_CLASS =
  "overflow-hidden border-b border-sam-border bg-sam-surface";

/** 댓글 블록 (상단 구분만) */
export const PHILIFE_DETAIL_COMMENTS_WRAP_CLASS =
  "border-t border-sam-border bg-sam-surface pb-4 pt-4";

/**
 * 글쓰기 FAB — 56×56 사각(`rounded-ui-rect`)·우하단·z-[21].
 * 배경은 시그니처 보라와 대비되는 밝은 면, 테두리·아이콘은 시그니처.
 */
export function philifeFabComposeClass(): string {
  return [
    "kasama-quick-add fixed z-[21] flex h-14 w-14 items-center justify-center rounded-ui-rect border-2 border-signature bg-white text-signature shadow-sam-elevated transition active:scale-[0.98] active:opacity-95",
    BOTTOM_NAV_FAB_LAYOUT.bottomOffsetClass,
    BOTTOM_NAV_FAB_LAYOUT.rightOffsetClass,
  ].join(" ");
}
