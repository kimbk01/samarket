/**
 * INAPP-07 — Android hardware back closes only the top-most overlay (dialog / sheet / popup).
 *
 * Contract:
 * - Every open overlay (DibayOverlayRoot) pushes one entry; closing / unmounting releases it.
 * - Exactly ONE native back listener exists app-wide, and only while the stack is non-empty.
 *   With no overlay open there is no listener → Android default back (WebView history / native
 *   call screen OnBackPressedCallback / messenger screens) is untouched.
 * - A back press runs the top-most entry only. A non-dismissible overlay (busy) swallows the
 *   press so the page underneath does not navigate away.
 * - Web / iOS: no listener is ever installed (Escape / backdrop keep working).
 * - 예외(결함 E, Owner 승인 2026-11-13 · docs/design/push-entry-back-fix-design-2026-11-13.md): 현재 화면의 바로 앞
 *   기록이 「알림 이동으로 떠난 항목」이면(`lib/push/push-navigation-back.ts`) 오버레이가 없어도 같은 리스너를 유지하고,
 *   오버레이가 없을 때 `history.back()` 한다. 그 밖의 화면은 위 규칙 그대로(리스너 없음 → Android 기본 뒤로).
 */

import { useEffect, useRef } from "react";
import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

type OverlayBackEntry = { id: number; run: () => void };

export type OverlayBackListenerDriver = {
  /** Install the single native listener; returns its remover. */
  install: (onBack: (ev: { canGoBack?: boolean }) => void) => () => void;
};

const stack: OverlayBackEntry[] = [];
let nextId = 1;
let removeListener: (() => void) | null = null;
let driverOverride: OverlayBackListenerDriver | null = null;
/** 결함 E — 알림 이동 직후 화면에서만 참. */
let pushNavigationBackActive = false;

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
};

function handleNativeBack(ev: { canGoBack?: boolean }): void {
  if (handleOverlayHardwareBack()) return;
  if (pushNavigationBackActive && typeof window !== "undefined") {
    window.history.back();
    return;
  }
  // Race (listener still attached after the last overlay closed): emulate default back.
  if (ev?.canGoBack && typeof window !== "undefined") window.history.back();
}

function syncListener(): void {
  const wanted = stack.length > 0 || pushNavigationBackActive;
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

/** 결함 E — 알림 이동 직후 화면 여부(push-navigation-back 만 호출). */
export function setPushNavigationBackActive(active: boolean): void {
  if (pushNavigationBackActive === active) return;
  pushNavigationBackActive = active;
  syncListener();
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
  pushNavigationBackActive = false;
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
