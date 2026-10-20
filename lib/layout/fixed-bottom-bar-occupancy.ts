/**
 * 화면 하단 고정 바(저장·제출 CTA, 댓글 입력바, 매장 오너 폼 하단 바 등) 공통 표식.
 *
 * 고정 바는 루트 요소에 이 클래스만 붙인다. 고객센터 FAB(`SupportFabHost`) 등 떠 있는 요소는
 * 화면에 붙은 표식 요소들의 **실측 점유 높이**(화면 아래 끝 → 바 위 끝)를 읽어 그 위로 비킨다.
 * 페이지마다 FAB 위치를 손으로 맞추지 않는다 (설계서 v3 §1-3 · §12).
 */
export const FIXED_BOTTOM_BAR_MARKER_CLASS = "sam-fixed-bottom-bar";

/** 고정 바 위에 띄울 때 FAB 와 바 사이 간격(px) — 하단탭 위 FAB 간격과 동일 */
export const FIXED_BOTTOM_BAR_FAB_GAP_PX = 10;

type RectLike = { top: number; height: number };

/**
 * 표식 요소들의 화면 하단 점유 높이(px) — 가장 높이 올라온 바 기준.
 * 숨김(높이 0)·화면 아래로 밀려난 요소는 제외한다.
 */
export function measureFixedBottomBarOccupiedPx(rects: Iterable<RectLike>, viewportHeightPx: number): number {
  if (!Number.isFinite(viewportHeightPx) || viewportHeightPx <= 0) return 0;
  let occupied = 0;
  for (const r of rects) {
    if (!r || !(r.height > 0)) continue;
    if (!(r.top < viewportHeightPx)) continue;
    occupied = Math.max(occupied, viewportHeightPx - Math.max(0, r.top));
  }
  return Math.max(0, Math.round(occupied));
}

/**
 * FAB `bottom` — 기본 위치(하단탭 위·오너 셸·safe-area)와 고정 바 위 중 **더 높은 쪽**.
 * 고정 바가 없으면 null (기존 클래스 위치 그대로).
 */
export function resolveFabBottomAboveFixedBarCss(baseBottomCss: string, occupiedPx: number): string | null {
  if (!(occupiedPx > 0)) return null;
  return `max(${baseBottomCss}, ${occupiedPx + FIXED_BOTTOM_BAR_FAB_GAP_PX}px)`;
}

/**
 * 한 고정 바의 점유 높이(px) — 화면 아래 끝 → 바 위 끝. 측정 불가(SSR·높이 0)면 요소 높이.
 * 토스트처럼 바 바로 위에 띄울 요소의 기준값.
 */
export function readFixedBarTopFromViewportBottomPx(el: HTMLElement): number {
  if (typeof window === "undefined") return el.offsetHeight;
  const r = el.getBoundingClientRect();
  const occupied = measureFixedBottomBarOccupiedPx([{ top: r.top, height: r.height }], window.innerHeight);
  return occupied > 0 ? occupied : el.offsetHeight;
}
