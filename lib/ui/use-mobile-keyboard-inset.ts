"use client";

import { useEffect, useState } from "react";
import {
  readSamarketShellKeyboardBottomInsetCssPx,
  subscribeSamarketShellKeyboardInsets,
} from "@/lib/platform/samarket-shell-keyboard";
import { resolveFormKeyboardOcclusionInsetPx } from "@/lib/ui/form-keyboard-viewport-contract";

type UseMobileKeyboardInsetOptions = {
  /** false 면 측정·리스너를 붙이지 않고 0 유지 (입장 직후 composer 경량화) */
  enabled?: boolean;
  /**
   * 상위가 `visualViewport.height` 로 채팅 셸 높이를 이미 맞춤 — 겹침(px) 추정을 끄고 0만 반환.
   * (푸터 `paddingBottom` 이중으로 입력창이 과하게 올라가는 것 방지)
   */
  disableOverlapEstimate?: boolean;
  /**
   * 레이아웃 높이가 이미 시각 viewport 하단에 맞춰졌는지(예: iOS + `100dvh` 축소)로 보일 때
   * 추가 패딩을 주지 않기 위한 여유(px). 이보다 작으면 inset 0.
   */
  layoutAlignedSlackPx?: number;
  /** `overlap` 이 이 값 미만이면 주소창 등 잡음으로 보고 0 */
  minObscuredPx?: number;
  /** @deprecated `minObscuredPx` + 정렬 검사로 대체. 옵션을 넘기면 `minObscuredPx` 와 더 큰 값이 적용된다. */
  minKeyboardPx?: number;
};

/**
 * Legacy numeric keyboard occlusion (px).
 * Prefer `useFormKeyboardViewport().effectiveBottomInset` for Form CTAs —
 * that API already merges safe vs keyboard and forbids double-count.
 *
 * This hook returns **occlusion only** (0 when layout already resized / adjustResize).
 * Callers that still do `safe-bottom + inset` on Android will over-pad if they ignore
 * Form SSOT — migrate those callers.
 */
export function useMobileKeyboardInset(options?: UseMobileKeyboardInsetOptions): number {
  const enabled = options?.enabled !== false;
  const disableOverlapEstimate = Boolean(options?.disableOverlapEstimate);
  const layoutAlignedSlackPx = Math.max(0, options?.layoutAlignedSlackPx ?? 28);
  const minObscuredPx = Math.max(
    0,
    Math.max(options?.minObscuredPx ?? 20, options?.minKeyboardPx ?? 0)
  );
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setInset(0);
      return;
    }
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;

    const measure = () => {
      if (disableOverlapEstimate) {
        setInset(0);
        return;
      }
      setInset(
        resolveFormKeyboardOcclusionInsetPx({
          nativeShellInsetPx: readSamarketShellKeyboardBottomInsetCssPx(),
          layoutAlignedSlackPx,
          minOcclusionPx: minObscuredPx,
        })
      );
    };

    measure();
    const unsubShell = subscribeSamarketShellKeyboardInsets(measure);
    if (vv) {
      vv.addEventListener("resize", measure);
      vv.addEventListener("scroll", measure);
    }
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      unsubShell();
      if (vv) {
        vv.removeEventListener("resize", measure);
        vv.removeEventListener("scroll", measure);
      }
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [enabled, disableOverlapEstimate, layoutAlignedSlackPx, minObscuredPx]);

  return inset;
}
