import { isLikelyIosWebKit } from "@/lib/ui/is-likely-ios-webkit";

/**
 * 모바일 셸(메신저 방·통화 오버레이) 공통 — `innerHeight`/`100dvh` 단독이 아니라
 * `visualViewport`(+ iOS `offsetTop`) 기준 보이는 세로(px).
 * keyboard inset은 height에서 차감하지 않는다 — `--chat-bottom-active` padding이 담당.
 *
 * @see docs/community-messenger-mobile-room-viewport.md
 * @see lib/ui/use-chat-viewport-shell-insets.ts
 */
export function resolveLayoutVisibleViewportCssPx(minHeightPx: number): number {
  if (typeof window === "undefined") return minHeightPx;

  const vv = window.visualViewport;
  if (vv) {
    const layoutBottomEdge = vv.offsetTop + vv.height;
    return Math.max(
      minHeightPx,
      isLikelyIosWebKit() ? Math.ceil(layoutBottomEdge) : Math.round(layoutBottomEdge)
    );
  }

  return Math.max(minHeightPx, Math.round(window.innerHeight));
}
