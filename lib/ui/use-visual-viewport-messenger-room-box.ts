"use client";

import { useEffect, useState } from "react";
import { isLikelyIosWebKit } from "@/lib/ui/is-likely-ios-webkit";
import {
  readSamarketShellKeyboardBottomInsetCssPx,
  subscribeSamarketShellKeyboardInsets,
} from "@/lib/platform/samarket-shell-keyboard";

export type VisualViewportMessengerBox = {
  heightPx: number;
  offsetTopPx: number;
};

/**
 * 모바일 메신저 방: `visualViewport` 가 변할 때(가상 키보드·주소창) 보이는 영역 높이·상단 오프셋.
 * `flex` 셸의 `maxHeight` 등에 써서 타임라인·입력란이 키보드와 맞물리게 한다.
 */
export function useVisualViewportMessengerRoomBox(enabled: boolean): VisualViewportMessengerBox | null {
  const [box, setBox] = useState<VisualViewportMessengerBox | null>(null);

  useEffect(() => {
    if (!enabled) {
      setBox(null);
      return;
    }
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) {
      setBox(null);
      return;
    }

    const sync = () => {
      const shellInset = readSamarketShellKeyboardBottomInsetCssPx();
      if (shellInset != null && shellInset > 0) {
        const heightPx = Math.max(120, Math.round(window.innerHeight - shellInset));
        const offsetTopPx = 0;
        setBox((prev) => {
          if (prev?.heightPx === heightPx && prev.offsetTopPx === offsetTopPx) return prev;
          return { heightPx, offsetTopPx };
        });
        return;
      }

      /** iOS: 소수 뷰포트 높이를 올림해 푸터·키보드 사이 빈틈을 줄임 */
      const rawH = vv.height;
      const heightPx = Math.max(120, isLikelyIosWebKit() ? Math.ceil(rawH) : Math.round(rawH));
      const offsetTopPx = Math.max(0, Math.round(vv.offsetTop));
      setBox((prev) => {
        if (prev?.heightPx === heightPx && prev.offsetTopPx === offsetTopPx) return prev;
        return { heightPx, offsetTopPx };
      });
    };

    sync();
    const unsubShell = subscribeSamarketShellKeyboardInsets(sync);
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      unsubShell();
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, [enabled]);

  return enabled ? box : null;
}
