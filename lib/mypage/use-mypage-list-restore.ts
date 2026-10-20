"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import {
  ensureMypageHubManualScrollRestoration,
  isMypageHubPath,
  restoreMypageHubScrollY,
} from "@/lib/mypage/mypage-hub-scroll-restore";
import {
  buildMypageListRestoreKey,
  consumeMypageListPopstatePending,
  currentMypageListRestoreKey,
  noteMypageListPopstatePending,
  readMypageListScroll,
  saveMypageListScroll,
} from "@/lib/mypage/mypage-list-scroll-restore";
import { isMypageStackPath } from "@/lib/mypage/mypage-stack-slide";
import { getMainAppScrollTop, subscribeAppShellScroll } from "@/lib/layout/main-app-scroll-root";

const SAVE_THROTTLE_MS = 150;

let popstateListenerInstalled = false;

function ensureMypageListPopstateListener(): void {
  if (typeof window === "undefined" || popstateListenerInstalled) return;
  popstateListenerInstalled = true;
  window.addEventListener("popstate", () => {
    // popstate 시점 location = 목적지. 내정보 하위 화면으로 돌아올 때만 그 키를 복원 대기로 표시.
    const path = window.location.pathname;
    if (isMypageStackPath(path) && !isMypageHubPath(path)) {
      noteMypageListPopstatePending(buildMypageListRestoreKey(path, window.location.search));
    }
  });
}

export type UseMypageListRestoreOptions = {
  /** 첫 페이지(또는 캐시) 렌더 완료 — 이때 복원 시도. */
  ready: boolean;
  /** 현재 불러온 페이지 수 — 저장 스냅샷에 함께 기록(캐시 복원 판단용). */
  loadedPages?: number;
};

export type UseMypageListRestoreResult = {
  /** 이 마운트가 뒤로가기 복귀인지(복원 대상) — 첫 layout effect 이후 확정. */
  isBackRestoreRef: { readonly current: boolean };
  /** 복원 키(`pathname?정렬된 search`) */
  keyRef: { readonly current: string | null };
};

/**
 * 내정보 하위 목록 화면 스크롤 복원 훅 (Part A §1.4). 화면 연결은 R4/R5.
 *
 * - 저장: 앱 셸 스크롤(스로틀) + 링크 클릭 캡처 시 현재 키에 저장.
 * - 복원: popstate 로 같은 키에 돌아왔고 `ready` 일 때 1회 — `restoreMypageHubScrollY` 재시도 방식.
 *   불러온 범위를 넘는 위치는 가능한 최대 위치까지만(추가 로드 없음).
 * - 새로 진입(push)하면 복원하지 않는다. 전역 scrollRestoration 은 그대로(X3).
 */
export function useMypageListRestore({ ready, loadedPages = 1 }: UseMypageListRestoreOptions): UseMypageListRestoreResult {
  const keyRef = useRef<string | null>(null);
  const isBackRestoreRef = useRef(false);
  const restoredRef = useRef(false);
  const loadedPagesRef = useRef(loadedPages);
  useLayoutEffect(() => {
    loadedPagesRef.current = loadedPages;
  }, [loadedPages]);

  /** 마운트 시 1회: 키 확정 + 뒤로가기 복귀 여부 소비 */
  useLayoutEffect(() => {
    ensureMypageHubManualScrollRestoration();
    ensureMypageListPopstateListener();
    const key = currentMypageListRestoreKey();
    keyRef.current = key;
    isBackRestoreRef.current = key != null && consumeMypageListPopstatePending(key);
  }, []);

  useEffect(() => {
    let lastSavedAt = 0;
    let trailing: number | null = null;
    const saveNow = () => {
      const key = keyRef.current;
      if (!key || currentMypageListRestoreKey() !== key) return;
      lastSavedAt = Date.now();
      saveMypageListScroll(key, { y: getMainAppScrollTop(), loadedPages: loadedPagesRef.current });
    };
    const onScroll = () => {
      if (!restoredRef.current && isBackRestoreRef.current) return; // 복원 전 0 위치로 덮어쓰지 않음
      const elapsed = Date.now() - lastSavedAt;
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
    const onClickCapture = (ev: MouseEvent) => {
      const t = ev.target;
      if (!(t instanceof Element)) return;
      if (!t.closest("a[href]")) return;
      saveNow();
    };
    document.addEventListener("click", onClickCapture, true);
    const unsub = subscribeAppShellScroll(onScroll);
    return () => {
      document.removeEventListener("click", onClickCapture, true);
      unsub();
      if (trailing != null) window.clearTimeout(trailing);
    };
  }, []);

  useLayoutEffect(() => {
    if (!ready || restoredRef.current) return;
    const key = keyRef.current;
    if (!key || !isBackRestoreRef.current) {
      restoredRef.current = true;
      return;
    }
    restoredRef.current = true;
    const snap = readMypageListScroll(key);
    if (snap && snap.y > 0) restoreMypageHubScrollY(snap.y);
  }, [ready]);

  return { isBackRestoreRef, keyRef };
}
