"use client";

import { useEffect, useState } from "react";
import {
  readSamarketShellKeyboardBottomInsetCssPx,
  subscribeSamarketShellKeyboardInsets,
} from "@/lib/platform/samarket-shell-keyboard";

type UseMobileKeyboardInsetOptions = {
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
 * 모바일 가상 키보드가 레이아웃 viewport 하단을 가리는 높이(px)를 추정한다.
 *
 * - Safari 등에서 키보드 시 `innerHeight`/`100dvh` 가 이미 줄어든 경우, `visualViewport` 와
 *   맞춰져 있으면 **0**을 반환해 이중 패딩(입력창이 키보드 위로 뜨는 빈 공간)을 막는다.
 * - 레이아웃 높이는 그대로인 경우에만 `innerHeight - (vv.height + vv.offsetTop)` 만큼 반환한다.
 */
export function useMobileKeyboardInset(options?: UseMobileKeyboardInsetOptions): number {
  const disableOverlapEstimate = Boolean(options?.disableOverlapEstimate);
  const layoutAlignedSlackPx = Math.max(0, options?.layoutAlignedSlackPx ?? 28);
  const minObscuredPx = Math.max(
    0,
    Math.max(options?.minObscuredPx ?? 20, options?.minKeyboardPx ?? 0)
  );
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;

    const measure = () => {
      /** 네이티브·WebView 셸이 있으면 `visualViewport` 보다 우선 (기기별 키보드 정확도) */
      const shellInset = readSamarketShellKeyboardBottomInsetCssPx();
      if (shellInset != null) {
        setInset(shellInset);
        return;
      }
      if (disableOverlapEstimate) {
        setInset(0);
        return;
      }
      if (!vv) {
        setInset(0);
        return;
      }
      const inner = window.innerHeight;
      const vvBottom = vv.height + vv.offsetTop;
      // 레이아웃이 이미 시각 viewport에 맞춤 → 추가 inset 불필요
      if (inner <= vvBottom + layoutAlignedSlackPx) {
        setInset(0);
        return;
      }
      const overlap = Math.max(0, inner - vvBottom);
      setInset(overlap >= minObscuredPx ? Math.round(overlap) : 0);
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
  }, [disableOverlapEstimate, layoutAlignedSlackPx, minObscuredPx]);

  return inset;
}

