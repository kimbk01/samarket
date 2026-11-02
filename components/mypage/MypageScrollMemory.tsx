"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { subscribeAppShellScroll } from "@/lib/layout/main-app-scroll-root";
import {
  currentMypageScrollTop,
  ensureMypageScrollManualRestoration,
  noteMypageScrollVisit,
  mypageScrollKey,
  readMypageScroll,
  restoreMypageScrollTo,
  saveMypageScroll,
  scrollMypageToTop,
} from "@/lib/mypage/mypage-scroll-memory";

/**
 * 내정보 전 화면 공통 스크롤 (`lib/mypage/mypage-scroll-memory.ts`) — `app/(main)/mypage/layout.tsx` 에 1개.
 * 들어가면 맨 위 · 뒤로 오면 그 화면 위치. 화면 전환 직후(이전 화면 위치가 남은 순간)의 스크롤은 저장하지 않는다.
 */
export function MypageScrollMemory() {
  const pathname = usePathname() ?? "";
  /** 경로 단위 — 화면 안 탭(`?tab=`) 전환은 새 화면이 아니므로 맨 위로 보내지 않는다(탭별 위치는 `useMypageTabParam`) */
  const key = mypageScrollKey(pathname, "");
  /** 저장 대상 키 — 이 화면의 위치를 정한 뒤에만 설정 */
  const activeKeyRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    activeKeyRef.current = null;
    ensureMypageScrollManualRestoration();
    const back = noteMypageScrollVisit(pathname) === "return";
    let cancel: (() => void) | null = null;
    if (back) {
      const y = readMypageScroll(key);
      if (y != null && y > 0) cancel = restoreMypageScrollTo(y);
      else scrollMypageToTop();
    } else {
      scrollMypageToTop();
    }
    activeKeyRef.current = key;
    return () => {
      cancel?.();
    };
  }, [key, pathname]);

  useEffect(() => {
    return subscribeAppShellScroll(() => {
      const k = activeKeyRef.current;
      if (k) saveMypageScroll(k, currentMypageScrollTop());
    });
  }, []);

  return null;
}
