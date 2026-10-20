"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getMainAppScrollTop, setMainAppScrollTop } from "@/lib/layout/main-app-scroll-root";

export type UseMypageTabParamOptions<T extends string> = {
  values: readonly T[];
  defaultValue: T;
  /** 기본 "tab". 기존 화면 호환 키(`filter`·`couponTab` 등)는 그대로 넘긴다(X17). */
  key?: string;
};

function pickTab<T extends string>(raw: string | null, values: readonly T[], fallback: T): T {
  return raw != null && (values as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/**
 * `?tab=` 유지 (최종 설계 §1.4).
 * - 읽기: `useSearchParams().get(key)`; 목록 밖 값 → `defaultValue`(URL 은 건드리지 않음).
 * - 쓰기: 네이티브 `history.replaceState(null, …)` — 뒤로가기 기록을 쌓지 않고, 서버 컴포넌트 재요청 없음
 *   (Next app-router 가 replaceState 를 패치해 `useSearchParams` 를 동기화한다). 기본값이면 파라미터 제거.
 * - 탭별 스크롤: 전환 직전 현재 탭 y 저장 → 새 탭 저장 y 복원(없으면 맨 위).
 */
export function useMypageTabParam<T extends string>(o: UseMypageTabParamOptions<T>): readonly [T, (next: T) => void] {
  const { values, defaultValue } = o;
  const key = o.key ?? "tab";
  const searchParams = useSearchParams();
  const fromUrl = pickTab(searchParams?.get(key) ?? null, values, defaultValue);
  const [tab, setTab] = useState<T>(fromUrl);
  const scrollByTab = useRef(new Map<string, number>());

  /** URL 이 바깥(뒤로가기 등)에서 바뀌면 따라간다 */
  useEffect(() => {
    setTab(fromUrl);
  }, [fromUrl]);

  const select = useCallback(
    (next: T) => {
      const safe = pickTab(next, values, defaultValue);
      if (typeof window === "undefined") {
        setTab(safe);
        return;
      }
      if (safe === tab) return;
      scrollByTab.current.set(tab, getMainAppScrollTop());
      setTab(safe);

      const url = new URL(window.location.href);
      if (safe === defaultValue) url.searchParams.delete(key);
      else url.searchParams.set(key, safe);
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);

      const y = scrollByTab.current.get(safe) ?? 0;
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => setMainAppScrollTop(y));
      else setMainAppScrollTop(y);
    },
    [defaultValue, key, tab, values]
  );

  return [tab, select] as const;
}
