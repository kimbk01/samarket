"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import {
  appScrollKey,
  captureAppScroll,
  ensureAppScrollManualRestoration,
  getAppScrollRoot,
  isAppScrollMemoryPath,
  noteAppScrollVisit,
  readAppScroll,
  restoreAppScroll,
  saveAppScroll,
  scrollAppToTop,
} from "@/lib/navigation/app-scroll-memory";

const SAVE_THROTTLE_MS = 150;

/**
 * 앱 전체 스크롤 규칙 (`lib/navigation/app-scroll-memory.ts`) — `ConditionalAppShell` 에 1개.
 * 들어가면 맨 위 · 뒤로/탭 복귀면 그 화면 위치 · 탭 다시 누르기면 맨 위 · 화면 안 조건 변경은 손대지 않음.
 */
export function AppScrollMemory({ pathname, search }: { pathname: string; search: string }) {
  const key = appScrollKey(pathname, search);
  const managed = isAppScrollMemoryPath(pathname);
  /** 저장 대상 키 — 이 화면의 위치를 정한 뒤에만 설정 (전환 직후 이전 화면 값으로 덮어쓰지 않게) */
  const activeKeyRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    activeKeyRef.current = null;
    if (!managed) return;
    ensureAppScrollManualRestoration();
    const visit = noteAppScrollVisit(key, window.history.length);
    let cancel: (() => void) | null = null;
    if (visit === "return") {
      const snap = readAppScroll(key);
      if (snap && snap.y > 0) cancel = restoreAppScroll(snap);
      else scrollAppToTop();
    } else if (visit === "new" || visit === "top") {
      scrollAppToTop();
    }
    activeKeyRef.current = key;
    return () => {
      cancel?.();
    };
  }, [key, managed]);

  useEffect(() => {
    let lastAt = 0;
    let trailing: number | null = null;
    const saveNow = () => {
      const k = activeKeyRef.current;
      if (!k) return;
      lastAt = Date.now();
      saveAppScroll(k, captureAppScroll(getAppScrollRoot()));
    };
    const onScroll = (ev: Event) => {
      const root = getAppScrollRoot();
      const t = ev.target;
      const fromRoot = t === root || ((t === document || t === window) && (root === document.documentElement || root === document.body));
      if (!fromRoot) return;
      const elapsed = Date.now() - lastAt;
      if (elapsed >= SAVE_THROTTLE_MS) {
        saveNow();
        return;
      }
      if (trailing == null) {
        trailing = window.setTimeout(() => {
          trailing = null;
          saveNow();
        }, SAVE_THROTTLE_MS - elapsed);
      }
    };
    /** 카드·링크를 누르는 순간 위치를 확정 (이동 직전 값) */
    const onClickCapture = (ev: MouseEvent) => {
      const t = ev.target;
      if (t instanceof Element && t.closest("a[href]")) saveNow();
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    document.addEventListener("click", onClickCapture, true);
    window.addEventListener("pagehide", saveNow);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("pagehide", saveNow);
      if (trailing != null) window.clearTimeout(trailing);
    };
  }, []);

  return null;
}
