import { readSamarketShellKeyboardBottomInsetCssPx } from "@/lib/platform/samarket-shell-keyboard";
import { isLikelyIosWebKit } from "@/lib/ui/is-likely-ios-webkit";

/**
 * 통화 오버레이 셸 전용 — `innerHeight`/`100dvh` 단독이 아니라
 * `visualViewport`(+ iOS `offsetTop`)·네이티브 shell inset 을 조합한 보이는 세로(px).
 *
 * @see docs/community-messenger-mobile-room-viewport.md
 * @see components/community-messenger/call-ui/CallScreenShell.tsx
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
