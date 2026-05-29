/**
 * CONTRACT — 오너 모바일 좁은 칸에서 라벨+건수 표시
 *
 * DO NOT: `{label} {count}` 를 한 `<span>`·문자열 연결로 렌더 (i18n 영문·기기별 폰트에서 줄바꿈·세로 정렬 깨짐).
 * DO: `OwnerMobileStackedLabelCount` 또는 동일 2행 DOM — 위 라벨 블록 + 아래 `tabular-nums` 건수 블록.
 *
 * 참조: `components/business/owner/OwnerMobileStackedLabelCount.tsx`
 * 검증: `npm run verify:owner-mobile-stacked-label-count-contract`
 */

/** 탭 바 — 라벨·건수 행 클래스 (variant `tab`) */
export const OWNER_MOBILE_STACKED_TAB_LABEL_CLASS =
  "w-full text-center text-[10px] font-bold leading-[1.2] line-clamp-2";

export const OWNER_MOBILE_STACKED_TAB_COUNT_CLASS =
  "min-h-[14px] text-[12px] font-bold leading-none tabular-nums";

export function buildOwnerMobileStackedLabelCountAriaLabel(
  label: string,
  count: number
): string {
  const trimmed = label.trim();
  if (!Number.isFinite(count) || count <= 0) return trimmed;
  return `${trimmed} ${count}`;
}
