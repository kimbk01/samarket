"use client";

import { useEffect, useState } from "react";

type UseMobileKeyboardInsetOptions = {
  minKeyboardPx?: number;
};

/**
 * 모바일 가상 키보드가 레이아웃 viewport 를 덮는 높이(px)를 추정한다.
 * - `visualViewport` 가 있으면 `innerHeight - (vv.height + vv.offsetTop)` 를 사용
 * - 주소창 변화 등 작은 흔들림은 `minKeyboardPx` 이하에서 0으로 클램프
 */
export function useMobileKeyboardInset(options?: UseMobileKeyboardInsetOptions): number {
  const minKeyboardPx = Math.max(0, options?.minKeyboardPx ?? 56);
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const measure = () => {
      const overlap = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
      setInset(overlap >= minKeyboardPx ? Math.round(overlap) : 0);
    };

    measure();
    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [minKeyboardPx]);

  return inset;
}

