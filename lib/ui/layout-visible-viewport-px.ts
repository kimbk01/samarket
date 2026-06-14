import { readSamarketShellKeyboardBottomInsetCssPx } from "@/lib/platform/samarket-shell-keyboard";
import { isLikelyIosWebKit } from "@/lib/ui/is-likely-ios-webkit";

/**
 * 모바일 셸(메신저 방·통화 오버레이) 공통 — `innerHeight`/`100dvh` 단독이 아니라
 * `visualViewport`(+ iOS `offsetTop`)·네이티브 shell inset 을 조합한 보이는 세로(px).
 *
 * @see docs/community-messenger-mobile-room-viewport.md
 * @see lib/ui/use-chat-viewport-shell-insets.ts
 */
export function resolveLayoutVisibleViewportCssPx(minHeightPx: number): number {
  if (typeof window === "undefined") return minHeightPx;

  const shellInset = readSamarketShellKeyboardBottomInsetCssPx();
  if (shellInset != null && shellInset > 0) {
    return Math.max(minHeightPx, Math.round(window.innerHeight - shellInset));
  }

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
