"use client";

import { createPortal } from "react-dom";
import { useLayoutEffect, useState, type ReactNode } from "react";

/**
 * `transform` 등이 걸린 메인 슬라이드 래퍼(`AppRouteTransition`) 안에 있으면
 * `position: fixed` 헤더가 뷰포트가 아니라 해당 조상에 묶여 “고정 안 됨”처럼 보인다.
 * 하단 네비 `bodyPortal`과 같은 이유로 `document.body`로 올린다.
 *
 * `useLayoutEffect` 로 마운트 플래그를 올려 **첫 페인트부터** 포털 내용이 존재하게 한다.
 * (`useEffect` 는 한 프레임 늦어 Slide Push **진입** `transition` 이 통째로 스킵되는 경우가 있다.)
 */
export function BodyPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(children, document.body);
}
