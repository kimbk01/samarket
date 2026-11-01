/**
 * 커뮤니티 글쓰기 작성기 UI 단일 기준(SSOT) — `docs/philife-write-composer-ssot.md` (Owner 승인 2026-11-01).
 *
 * 작성기(시트·`/philife/write`·`?edit=`)는 이 파일의 클래스만 쓴다. 규칙:
 * - 색·글자·반경은 `app/design-tokens.css` 토큰(`sam-*`)만 — hex·`text-[NNpx]` 금지.
 * - 입력 글자 16px(`--sm-font-input`) 이상, 누르는 칸 44px(`h-11`) 이상. 전역 input 규칙(층 밖 CSS)을 이기도록 입력 글자 크기는 `!` 로 준다.
 * - 아이콘은 지금 쓰는 lucide 선 아이콘만, 글자색만(브랜드색·이모지 금지).
 * - CTA 는 헤더 오른쪽 1개 — 화면 아래 「취소·등록」 줄 없음.
 * 검사: `npm run verify:philife-write-composer-contract`.
 */

/** 화면 전체 작성기 — 시트·별도 페이지 공통 */
export const PHILIFE_COMPOSER_ROOT_CLASS =
  "flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden bg-sam-surface text-sam-fg";

/**
 * 별도 페이지(`/philife/write`): 전역 헤더·하단 탭(z-1200) 위를 덮는 고정 층.
 * 확인 대화상자·시트(z-1300↑) 아래여야 나가기 확인이 가려지지 않는다.
 */
export const PHILIFE_COMPOSER_PAGE_LAYER_CLASS = "fixed inset-0 z-[1250] flex flex-col bg-sam-surface";

/** 헤더 52px: ✕ · 제목 · CTA */
export const PHILIFE_COMPOSER_HEADER_CLASS =
  "flex h-13 shrink-0 items-center justify-between gap-1 border-b border-sam-border-soft bg-sam-surface px-1";
export const PHILIFE_COMPOSER_HEADER_ICON_BTN_CLASS =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-ui-rect text-sam-fg active:bg-sam-surface-muted";
export const PHILIFE_COMPOSER_HEADER_TITLE_CLASS = "sam-text-page-title min-w-0 flex-1 truncate text-center";
/** CTA: 준비됨 = 브랜드색, 빈 칸 있음 = 흐림(눌러서 빠진 칸 안내), 업로드 중·등록 중 = 비활성 */
export const PHILIFE_COMPOSER_HEADER_CTA_CLASS =
  "inline-flex h-11 min-w-14 shrink-0 items-center justify-center rounded-ui-rect px-3 text-[length:var(--sm-font-input)] font-bold active:bg-sam-surface-muted disabled:text-sam-meta";
export const PHILIFE_COMPOSER_HEADER_CTA_READY_CLASS = "text-sam-primary";
export const PHILIFE_COMPOSER_HEADER_CTA_IDLE_CLASS = "text-sam-primary/45";

/** 헤더 아래 오류 띠 1곳 */
export const PHILIFE_COMPOSER_ERROR_BAND_CLASS =
  "sam-text-helper max-h-20 shrink-0 overflow-y-auto border-b border-sam-border-soft bg-sam-danger-soft px-4 py-2 font-medium !text-sam-danger";

/** 스크롤 영역(주제·제목·본문) */
export const PHILIFE_COMPOSER_SCROLL_CLASS = "min-h-0 flex-1 overflow-y-auto overscroll-y-contain";

/** 주제 줄 52px */
export const PHILIFE_COMPOSER_TOPIC_ROW_CLASS =
  "flex min-h-13 w-full items-center justify-between gap-3 border-b border-sam-border-soft px-4 text-left active:bg-sam-surface-muted";
export const PHILIFE_COMPOSER_TOPIC_PLACEHOLDER_CLASS = "text-[length:var(--sm-font-input)] text-sam-meta";
export const PHILIFE_COMPOSER_TOPIC_CHIP_CLASS =
  "sam-text-body inline-flex h-8 max-w-full items-center truncate rounded-full bg-sam-primary-soft px-3 font-semibold !text-sam-primary";

/** 제목: 테두리 없음 · 큰 글자 */
export const PHILIFE_COMPOSER_TITLE_INPUT_CLASS =
  "block w-full min-w-0 border-0 border-b border-sam-border-soft bg-transparent px-4 py-3.5 !text-[length:var(--sam-text-hero-size)] !font-bold text-sam-fg outline-none placeholder:!text-[length:var(--sam-text-hero-size)] placeholder:font-semibold placeholder:text-sam-meta";

/** 본문 칸(편집기·기존 입력칸 공통 여백) */
export const PHILIFE_COMPOSER_BODY_CLASS = "min-h-[40dvh] px-4 py-3";
export const PHILIFE_COMPOSER_LEGACY_TEXTAREA_CLASS =
  "block min-h-[40dvh] w-full resize-none border-0 bg-transparent p-0 !text-[length:var(--sm-font-input)] leading-relaxed text-sam-fg outline-none placeholder:text-sam-meta";

/** 빈 칸 오류 표시(밑줄) */
export const PHILIFE_COMPOSER_FIELD_INVALID_CLASS = "!border-b-sam-danger";

/** 본문 아래 보조 영역(기존 첨부 사진 · 기존 편집기 사진 줄) */
export const PHILIFE_COMPOSER_EXTRA_SECTION_CLASS = "border-t border-sam-border-soft px-4 py-3";
export const PHILIFE_COMPOSER_EXTRA_HEAD_CLASS = "sam-text-helper mb-2 font-semibold";
export const PHILIFE_COMPOSER_NOTICE_CLASS = "sam-text-helper px-4 pt-3";

/** 아래 도구줄 — 키보드 바로 위(키보드 없으면 화면 맨 아래 + 안전 영역) */
export const PHILIFE_COMPOSER_TOOLBAR_CLASS = "shrink-0 border-t border-sam-border bg-sam-surface";
export const PHILIFE_COMPOSER_TOOLBAR_ROW_CLASS =
  "flex h-13 min-w-0 items-center overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
export const PHILIFE_COMPOSER_TOOL_BTN_CLASS =
  "inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-ui-rect px-1.5 text-sam-muted active:bg-sam-surface-muted disabled:opacity-40";
export const PHILIFE_COMPOSER_TOOL_BTN_ON_CLASS = "bg-sam-app !text-sam-fg";
export const PHILIFE_COMPOSER_TOOL_ICON_CLASS = "h-5 w-5";
export const PHILIFE_COMPOSER_TOOL_COUNT_CLASS = "sam-text-helper tabular-nums";
export const PHILIFE_COMPOSER_TOOL_SEPARATOR_CLASS = "mx-0.5 h-6 w-px shrink-0 bg-sam-border";

/** 아래에서 올라오는 시트 안 줄·입력 */
export const PHILIFE_COMPOSER_SHEET_ROW_CLASS =
  "flex min-h-13 w-full items-center justify-between gap-3 border-t border-sam-border-soft px-1 text-left text-[length:var(--sm-font-input)] text-sam-fg active:bg-sam-surface-muted";
export const PHILIFE_COMPOSER_SHEET_ROW_ON_CLASS = "font-semibold !text-sam-primary";
export const PHILIFE_COMPOSER_SHEET_INPUT_CLASS = "sam-input w-full";
