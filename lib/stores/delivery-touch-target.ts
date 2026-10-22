/**
 * UI-11 — 배달 소비자 작은 버튼(알약·아이콘)의 **터치 영역만** `--delivery-touch-min`(44px) 이상으로 넓힌다.
 *
 * 보이는 크기는 그대로 두고, 버튼 중앙에 투명 `::after` 상자(높이 44px · 폭 max(100%, 44px))를 둔다.
 * 의사 요소 탭은 버튼 자신의 탭으로 처리된다. 조상에 `overflow` 가 있으면 그 경계에서 잘리므로,
 * 스크롤 띠 안에서는 띠에 위·아래 여백을 함께 둔다 (예: `StoreListFilters`).
 * Tailwind v4 소스 스캔 — 완성된 정적 문자열만 사용한다.
 */
export const DELIVERY_TOUCH_HIT_EXPAND_CLASS =
  "relative after:absolute after:left-1/2 after:top-1/2 after:h-[var(--delivery-touch-min)] after:w-[max(100%,var(--delivery-touch-min))] after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']";

/** 글자 링크·텍스트 버튼 — 세로 터치 영역 44px (가로는 글자 폭 + 여백) */
export const DELIVERY_TOUCH_TEXT_LINK_CLASS =
  "inline-flex min-h-[var(--delivery-touch-min)] items-center";
