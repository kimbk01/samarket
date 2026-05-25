import { APP_TIER1_HEADER_ICON_BTN_CLASS } from "@/lib/layout/app-tier1-header";

/**
 * 거래·커뮤니티(필라이프) 1단 헤더 우측과 맞출 때 — **기본은 원형 셸 없음**.
 * 셸 클래스: `Sam.headerAction` (`sam-header-action`, 둥근 사각 히트 + 호버 시 서피스만).
 * 글리프·배지·압궉 문자열만 여기서 공유.
 *
 * 수치 단일 소스: `app/sector-header.css` · `app/delivery-tokens.css`
 * `--delivery-header-action`(36px) · `--delivery-header-icon-glyph`(22px) · `--delivery-header-action-gap`(0px).
 * CSS: `app/delivery-components.css` `.sam-tier1-header-icon-cluster`
 *
 * @see `PhilifeHeaderMessengerButton`, `PhilifeHeaderNotificationInbox`
 */
export const SAM_TIER1_HEADER_ICON_HIT_PX = 36 as const;

/** 36×36 히트 — 섹터 헤더 우측 액션과 동일 */
export const SAM_TIER1_HEADER_ICON_HIT_CLASS =
  "h-[length:var(--delivery-header-action)] w-[length:var(--delivery-header-action)]" as const;

/**
 * 배달 1단 우측 글리프 — 22px (`--delivery-header-icon-glyph`).
 */
export const SAM_TIER1_HEADER_ICON_GLYPH_CLASS =
  "h-[length:var(--delivery-header-icon-glyph)] w-[length:var(--delivery-header-icon-glyph)]" as const;

/** 좁은 헤더·보조 아이콘용 (스토어 검색 등) */
export const SAM_TIER1_HEADER_ICON_GLYPH_SM_CLASS = "h-5 w-5" as const;

/** 윤곽선 아이콘 굵기 — `PhilifeHeaderNotificationInbox` 종·`RegionBar` 검색과 동일 */
export const SAM_TIER1_HEADER_ICON_STROKE_WIDTH = 2 as const;

/**
 * `sam-header-action` 계열과 동일한 압궉 피드백 — PhilifeHeaderMessengerButton 과 동일 문자열.
 */
export const samTier1HeaderIconMicro =
  "transition-[transform,background-color,opacity] duration-300 ease-out active:duration-100 active:scale-[0.88] active:bg-sam-surface-muted active:opacity-85" as const;

/** 1단 헤더 우측 액션 버튼 — 36×36 · sector grid · micro 피드백 */
export const SAM_TIER1_HEADER_ACTION_BTN_CLASS =
  `${APP_TIER1_HEADER_ICON_BTN_CLASS} sam-header-action shrink-0 text-sam-fg ${samTier1HeaderIconMicro}` as const;

/** 종 알림 배지 — PhilifeHeaderNotificationInbox / PhilifeHeaderMessengerButton 과 동일 산식 */
export const samTier1HeaderIconBadge =
  "absolute right-0.5 top-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-sam-primary px-0.5 text-[9px] font-bold leading-none text-sam-on-primary" as const;

/** `RegionBar` 거래·필라이프 1단 우측 열 — 메신저 `rightSlot` 과 동일 폭·정렬 */
export const samTier1HeaderRightColumn =
  "sector-header-bar__right flex h-full min-h-0 shrink-0 flex-none items-center justify-end self-stretch" as const;

/** 커뮤니티·거래·내정보 1단 우측 아이콘 나열 — 배달 `gap: var(--delivery-header-action-gap)` 와 동일 */
export const SAM_TIER1_HEADER_ICON_CLUSTER_CLASS = "sam-tier1-header-icon-cluster" as const;

export const samTier1HeaderIconCluster = SAM_TIER1_HEADER_ICON_CLUSTER_CLASS;

export type SamTier1HeaderIconHitPx = typeof SAM_TIER1_HEADER_ICON_HIT_PX;
export type SamTier1HeaderIconGlyphClass =
  | typeof SAM_TIER1_HEADER_ICON_GLYPH_CLASS
  | typeof SAM_TIER1_HEADER_ICON_GLYPH_SM_CLASS;
