"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/** `grid-template-columns` 계산값의 열 수 (예: "170px 170px" → 2). 읽지 못하면 null */
export function readGridColumnCount(gridTemplateColumns: string | null | undefined): number | null {
  const v = String(gridTemplateColumns ?? "").trim();
  if (!v || v === "none") return null;
  const n = v.split(/\s+/).filter(Boolean).length;
  return n > 0 ? n : null;
}

/**
 * F3: 거래 격자의 실제 열 수(모바일 2 · 태블릿 3 · 와이드 4). 서버·첫 그림은 `fallback` — hydration 차이 없음.
 * 목록 `<ul>` 이 로딩·빈 화면 뒤에 나중에 생겨도 붙도록 그릴 때마다 대상 요소를 확인한다.
 */
export function useGridColumnCount(ref: RefObject<HTMLElement | null>, fallback: number): number {
  const [count, setCount] = useState(fallback);
  const observedRef = useRef<HTMLElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (el === observedRef.current) return;
    cleanupRef.current?.();
    cleanupRef.current = null;
    observedRef.current = el;
    if (!el || typeof window === "undefined") return;
    const measure = () => {
      const n = readGridColumnCount(window.getComputedStyle(el).gridTemplateColumns);
      if (n) setCount((prev) => (prev === n ? prev : n));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    cleanupRef.current = () => ro.disconnect();
  });

  useEffect(
    () => () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      observedRef.current = null;
    },
    []
  );

  return count;
}
