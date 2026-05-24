/**
 * 거래·커뮤니티(필라이프) 1단 헤더 우측과 맞출 때 — **기본은 원형 셸 없음**.
 * 셸 클래스: `Sam.headerAction` (`sam-header-action`, 둥근 사각 히트 + 호버 시 서피스만).
 * 글리프·배지·압궉 문자열만 여기서 공유.
 *
 * 수치 단일 소스: `app/delivery-tokens.css` `--delivery-header-action`(40px) ·
 * `--delivery-header-icon-glyph`(22px) · `--delivery-header-action-gap`(4px).
 * CSS: `app/delivery-components.css` `.sam-tier1-header-icon-cluster`
 *
 * @see `PhilifeHeaderMessengerButton`, `PhilifeHeaderNotificationInbox`
 */
export const SAM_TIER1_HEADER_ICON_HIT_PX = 40 as const;

/** 40×40 히트 — 배달 1단 우측과 동일 */
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

/** 종 알림 배지 — PhilifeHeaderNotificationInbox / PhilifeHeaderMessengerButton 과 동일 산식 */
export const samTier1HeaderIconBadge =
  "absolute right-0.5 top-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-sam-primary px-0.5 text-[9px] font-bold leading-none text-sam-on-primary" as const;

/** `RegionBar` 거래·필라이프 1단 우측 열 — 메신저 `rightSlot` 과 동일 폭·정렬 */
export const samTier1HeaderRightColumn =
  "flex h-full min-h-0 w-[160px] shrink-0 flex-none items-center justify-end self-stretch pl-0 -mr-1" as const;

/** 커뮤니티·거래·내정보 1단 우측 아이콘 나열 — 배달 `gap: var(--delivery-header-action-gap)` 와 동일 */
export const SAM_TIER1_HEADER_ICON_CLUSTER_CLASS = "sam-tier1-header-icon-cluster" as const;

export const samTier1HeaderIconCluster = SAM_TIER1_HEADER_ICON_CLUSTER_CLASS;

export type SamTier1HeaderIconHitPx = typeof SAM_TIER1_HEADER_ICON_HIT_PX;
export type SamTier1HeaderIconGlyphClass =
  | typeof SAM_TIER1_HEADER_ICON_GLYPH_CLASS
  | typeof SAM_TIER1_HEADER_ICON_GLYPH_SM_CLASS;
