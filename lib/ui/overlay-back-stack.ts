/**
 * INAPP-07 — Android hardware back closes only the top-most overlay (dialog / sheet / popup).
 *
 * Contract:
 * - Every open overlay (DibayOverlayRoot) pushes one entry; closing / unmounting releases it.
 * - Exactly ONE native back listener exists app-wide.
 *   개정(push-tap-entry P2, Owner 승인 2026-11-13 · docs/design/push-tap-entry-fix-design-2026-11-13.md):
 *   Android 메인 앱에서는 `enableAndroidHardwareBackOwner()` 로 리스너를 **항상** 둔다. 이유: 알림 이동처럼
 *   페이지 안 터치 없이 쌓인 기록은 Chromium 이 뒤로 UI 에서 건너뛰어 WebView `canGoBack` 이 false 가 되고,
 *   Capacitor 기본 처리는 그때 아무것도 하지 않아 시스템 뒤로가기가 죽었다(실기 2026-11-10 Samsung 운영 39).
 *   처리 순서: ① 맨 위 오버레이 닫기 ② 웹 기록이 있으면 history.back() (API 는 건너뛰기 규칙 영향 없음)
 *   ③ 없으면 앱 내리기(Android 첫 화면 뒤로). 통화 연결 중 뒤로는 MainActivity 콜백이 먼저 받아 불변.
 * - A back press runs the top-most entry only. A non-dismissible overlay (busy) swallows the
 *   press so the page underneath does not navigate away.
 * - Web / iOS: no listener is ever installed (Escape / backdrop keep working).
 */

import { useEffect, useRef } from "react";
import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

type OverlayBackEntry = { id: number; run: () => void };

export type OverlayBackListenerDriver = {
  /** Install the single native listener; returns its remover. */
  install: (onBack: (ev: { canGoBack?: boolean }) => void) => () => void;
  /** 웹 기록이 없을 때 — 앱 내리기(Android 첫 화면 뒤로). */
  minimize?: () => void;
};

const stack: OverlayBackEntry[] = [];
let nextId = 1;
let removeListener: (() => void) | null = null;
let driverOverride: OverlayBackListenerDriver | null = null;
/** Android 메인 앱이 뒤로 처리를 맡는 동안 true — 오버레이가 없어도 리스너 유지. */
let alwaysOnOwners = 0;

/** Default driver — @capacitor/app on Android only. */
const capacitorDriver: OverlayBackListenerDriver = {
  install(onBack) {
    if (resolveCapacitorShellPlatform() !== "android") return () => {};
    let removed = false;
    let handle: { remove: () => void | Promise<void> } | null = null;
    void import("@capacitor/app")
      .then(({ App }) => App.addListener("backButton", onBack))
      .then((h) => {
        if (removed) {
          void h.remove();
          return;
        }
        handle = h;
      })
      .catch(() => {
        /* plugin missing — default back stays */
      });
    return () => {
      removed = true;
      void handle?.remove();
    };
  },
  minimize() {
    if (resolveCapacitorShellPlatform() !== "android") return;
    void import("@capacitor/app")
      .then(({ App }) => App.minimizeApp())
      .catch(() => {
        /* plugin missing */
      });
  },
};

/** 웹(JS) 기준 뒤로 갈 기록이 있는가 — Navigation API 가 있으면 그것, 없으면 네이티브 값. */
function webHistoryCanGoBack(ev: { canGoBack?: boolean }): boolean {
  if (typeof window === "undefined") return false;
  const nav = (window as unknown as { navigation?: { canGoBack?: unknown } }).navigation;
  if (nav && typeof nav.canGoBack === "boolean") return nav.canGoBack;
  return Boolean(ev?.canGoBack);
}

function handleNativeBack(ev: { canGoBack?: boolean }): void {
  if (handleOverlayHardwareBack()) return;
  if (webHistoryCanGoBack(ev)) {
    window.history.back();
    return;
  }
  // 오버레이만 맡던 리스너(경합)는 기존처럼 아무것도 하지 않는다. 항상 맡는 동안에만 앱 내리기.
  if (alwaysOnOwners > 0) (driverOverride ?? capacitorDriver).minimize?.();
}

function syncListener(): void {
  const wanted = stack.length > 0 || alwaysOnOwners > 0;
  if (wanted && !removeListener) {
    removeListener = (driverOverride ?? capacitorDriver).install(handleNativeBack);
  } else if (!wanted && removeListener) {
    const remove = removeListener;
    removeListener = null;
    remove();
  }
}

/**
 * Register an open overlay. `onBack` = close handler; `null` = swallow (non-dismissible).
 * @returns release — call when the overlay closes / unmounts.
 */
export function pushOverlayBackEntry(onBack: (() => void) | null): () => void {
  const entry: OverlayBackEntry = { id: nextId++, run: () => onBack?.() };
  stack.push(entry);
  syncListener();
  return () => {
    const i = stack.findIndex((e) => e.id === entry.id);
    if (i >= 0) stack.splice(i, 1);
    syncListener();
  };
}

/**
 * Android 메인 앱이 시스템 뒤로를 맡는다(오버레이 없을 때도 리스너 유지). 반환값으로 해제.
 * 호출: `AndroidHardwareBackOwner`(메인 앱 공급자 트리에 1개). Android 외 플랫폼은 드라이버가 설치하지 않는다.
 */
export function enableAndroidHardwareBackOwner(): () => void {
  alwaysOnOwners += 1;
  syncListener();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    alwaysOnOwners = Math.max(0, alwaysOnOwners - 1);
    syncListener();
  };
}

/** Run the top-most overlay's back handler. @returns true when an overlay consumed the press. */
export function handleOverlayHardwareBack(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.run();
  return true;
}

export function overlayBackStackDepth(): number {
  return stack.length;
}

export function isOverlayBackListenerInstalled(): boolean {
  return removeListener != null;
}

/** Tests only — swap the native driver and clear state. */
export function __setOverlayBackListenerDriverForTests(driver: OverlayBackListenerDriver | null): void {
  stack.length = 0;
  alwaysOnOwners = 0;
  if (removeListener) {
    const remove = removeListener;
    removeListener = null;
    remove();
  }
  driverOverride = driver;
}

/**
 * Hook for overlay roots. Registers while `active`; the latest `onBack` is always used.
 * `onBack === null` while active → the press is swallowed (busy / non-dismissible overlay).
 */
export function useOverlayHardwareBack(active: boolean, onBack: (() => void) | null): void {
  const ref = useRef(onBack);
  useEffect(() => {
    ref.current = onBack;
  });
  useEffect(() => {
    if (!active) return;
    return pushOverlayBackEntry(() => ref.current?.());
  }, [active]);
}
