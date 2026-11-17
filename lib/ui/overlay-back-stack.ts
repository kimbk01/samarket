/**
 * INAPP-07 — Android hardware back closes only the top-most overlay (dialog / sheet / popup).
 *
 * 기기 기능 보존(Owner 2026-11-17 「◁·○·||| 는 기기 기능 — 막거나 지우면 안 된다」,
 * 감사 docs/audit/android-system-nav-2026-11-17/README.md D1):
 *   Capacitor AppPlugin 뒤로 콜백은 항상 켜져 있고 `canGoBack=false` 일 때 아무것도 하지 않는다 →
 *   첫 화면(웹 기록 index 0)에서 ◁ 무반응. 그래서 웹 기록 첫 항목에서도 이 단일 리스너를 켜고,
 *   갈 곳이 없으면 `App.minimizeApp()`(= `moveTaskToBack`, Android 런처 루트의 기본 동작)으로 앱을 내린다.
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
 * - 예외(D1·F4, Owner 「Start F1·F2·F3」·「F4 는 (가) Android 표준」 2026-11-17): 첫 화면에서도 리스너를 유지한다.
 *   첫 화면 = 하단 탭을 눌러 들어온 기록 항목, 또는 앱 기록의 첫 항목.
 *   처리 순서 = 오버레이 → 알림 이동 뒤로 → 첫 화면이면 (시작 탭이 아니면 시작 탭으로 · 시작 탭이면 앱 내리기)
 *   → `canGoBack` 이면 `history.back()` → 그 밖은 `App.minimizeApp()`.
 *   그 밖의 일반 화면은 지금처럼 리스너 없음(Capacitor 기본 goBack).
 */

import { useEffect, useRef } from "react";
import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

type OverlayBackEntry = { id: number; run: () => void };

export type OverlayBackListenerDriver = {
  /** Install the single native listener; returns its remover. */
  install: (onBack: (ev: { canGoBack?: boolean }) => void) => () => void;
  /** 갈 곳이 없을 때 — 앱을 내린다(Android 기본 뒤로와 같은 결과). */
  minimize: () => void;
};

const stack: OverlayBackEntry[] = [];
let nextId = 1;
let removeListener: (() => void) | null = null;
let driverOverride: OverlayBackListenerDriver | null = null;
/** 결함 E — 알림 이동 직후 화면에서만 참. */
let pushNavigationBackActive = false;
/**
 * D1·F4 — 첫 화면 ◁ 처리(앱 내리기 또는 시작 탭으로). 첫 화면이 아니면 null.
 * `lib/ui/android-root-back.ts` 만 바꾼다.
 */
let rootBackAction: (() => void) | null = null;

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
        /* plugin missing — nothing else can leave the app from the web layer */
      });
  },
};

function handleNativeBack(ev: { canGoBack?: boolean }): void {
  if (handleOverlayHardwareBack()) return;
  if (pushNavigationBackActive && typeof window !== "undefined") {
    window.history.back();
    return;
  }
  // 하단 탭 첫 화면·앱 첫 화면 — Android 표준(시작 탭으로, 시작 탭이면 앱 내리기).
  if (rootBackAction) {
    rootBackAction();
    return;
  }
  // 앱 안 이전 화면이 있으면 Capacitor 기본(goBack)과 같은 결과.
  if (ev?.canGoBack) {
    if (typeof window !== "undefined") window.history.back();
    return;
  }
  // 갈 곳이 없다 — 기기 기본 뒤로처럼 앱을 내린다(무반응 금지, D1).
  (driverOverride ?? capacitorDriver).minimize();
}

function syncListener(): void {
  const wanted = stack.length > 0 || pushNavigationBackActive || rootBackAction != null;
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

/** D1·F4 — 첫 화면 ◁ 처리 지정(`android-root-back` 만 호출). null = 첫 화면 아님. */
export function setRootBackAction(action: (() => void) | null): void {
  if (rootBackAction === action) return;
  rootBackAction = action;
  syncListener();
}

/** 기기 기본 뒤로와 같은 「앱 내리기」(Android 만). */
export function minimizeAppForBack(): void {
  (driverOverride ?? capacitorDriver).minimize();
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
  rootBackAction = null;
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
