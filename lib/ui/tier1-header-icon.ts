/**
 * 거래·커뮤니티(필라이프) 1단 헤더 우측과 맞출 때 — **기본은 원형 셸 없음**.
 * 셸 클래스: `Sam.headerAction` (`sam-header-action`, 둥근 사각 히트 + 호버 시 서피스만).
 * 글리프·배지·압궉 문자열만 여기서 공유.
 *
 * @see `PhilifeHeaderMessengerButton`, `PhilifeHeaderNotificationInbox`
 */
export const SAM_TIER1_HEADER_ICON_HIT_PX = 40 as const;

/**
 * 거래 1단 우측·필라이프 메신저 버튼과 동일 시각 무게 — `h-6 w-6`
 * (`TradeHeaderComposeButton` Plus, `PhilifeHeaderMessengerButton` 말풍선).
 */
export const SAM_TIER1_HEADER_ICON_GLYPH_CLASS = "h-6 w-6" as const;

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

/** 아이콘 버튼 나열 — 인접 `-ml-1` 로 거래 홈과 동일 간격 */
export const samTier1HeaderIconCluster =
  "inline-flex h-full max-w-full shrink-0 items-center justify-end gap-0 [&>*+*]:-ml-1" as const;

export type SamTier1HeaderIconHitPx = typeof SAM_TIER1_HEADER_ICON_HIT_PX;
export type SamTier1HeaderIconGlyphClass =
  | typeof SAM_TIER1_HEADER_ICON_GLYPH_CLASS
  | typeof SAM_TIER1_HEADER_ICON_GLYPH_SM_CLASS;
