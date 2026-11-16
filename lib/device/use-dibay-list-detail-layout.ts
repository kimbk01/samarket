"use client";

import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";
import {
  DIBAY_LIST_DETAIL_SPLIT_MIN_CSS,
  resolveDibayListDetailLayout,
  type DibayListDetailLayout,
} from "@/lib/device/dibay-device-profile";
import { useDibayAppShellAuthority } from "@/lib/device/use-dibay-app-shell";

/**
 * S4 · 회전 규칙 R2 — 기기 종류(프로필 표) × 창 CSS 폭(≥768, 메신저 두 칸과 같은 미디어 조건).
 * 회전·창 크기 변경 → 미디어 조건 변경 → 같은 함수로 다시 계산.
 */
export function useDibayListDetailLayout(): DibayListDetailLayout {
  const { deviceClass } = useDibayAppShellAuthority();
  const wide = useIsMessengerSplitViewport();
  return resolveDibayListDetailLayout({ deviceClass, widthCss: wide ? DIBAY_LIST_DETAIL_SPLIT_MIN_CSS : 0 });
}
