/**
 * INAPP-07 — Android hardware back closes only the top-most overlay (dialog / sheet / popup).
 *
 * Contract:
 * - Every open overlay (DibayOverlayRoot) pushes one entry; closing / unmounting releases it.
 * - Exactly ONE native back listener exists app-wide, and only while the stack is non-empty.
 *   With no overlay open there is no listener → Android default back (WebView history / native
 *   call screen OnBackPressedCallback / messenger screens) is untouched.
 *   새 설치본(S1): 리스너가 있는 동안만 DibaySystemBack.setActive(true) — 없으면 네이티브가 ◁ 를 받지 않아
 *   이전 페이지가 없는 화면의 ◁ 는 Android 가 처리한다.
 * - A back press runs the top-most entry only. A non-dismissible overlay (busy) swallows the
 *   press so the page underneath does not navigate away.
 * - Web / iOS: no listener is ever installed (Escape / backdrop keep working).
 * - 예외(결함 E, Owner 승인 2026-11-13 · docs/design/push-entry-back-fix-design-2026-11-13.md): 현재 화면의 바로 앞
 *   기록이 「알림 이동으로 떠난 항목」이면(`lib/push/push-navigation-back.ts`) 오버레이가 없어도 같은 리스너를 유지하고,
 *   오버레이가 없을 때 `history.back()` 한다. 그 밖의 화면은 위 규칙 그대로(리스너 없음 → Android 기본 뒤로).
 */

import { useEffect, useRef } from "react";
import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import { isNativeIntroActive } from "@/lib/launch-intro/native-intro-client";

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

type BackListenerHandle = { remove: () => void | Promise<void> };
type NativeBackSource = {
  addListener: (
    eventName: "backButton",
    listener: (ev: { canGoBack?: boolean }) => void,
  ) => Promise<BackListenerHandle>;
  /** DibaySystemBack 만 — 네이티브가 「◁ 를 받을지」 정하는 데 쓰는 신호(S1). 구 설치본(App 플러그인)에는 없음. */
  setActive?: (opts: { active: boolean }) => Promise<void>;
};

let systemBackSource: NativeBackSource | null = null;

/**
 * S1 (docs/audit/android-system-nav-2026-11-17/s1-s3-design.md): 새 설치본은 DibaySystemBack 가 ◁ 를
 * 「받아서 할 일이 있을 때만」 받는다 — 리스너를 붙인 동안만 setActive(true). 플러그인이 없는 구 설치본은 지금처럼 App.
 */
async function resolveNativeBackSource(): Promise<{ source: NativeBackSource }> {
  // Capacitor 플러그인 객체는 모든 속성(then 포함)에 함수를 돌려주는 프록시라 Promise 값으로 그대로 반환하면
  // thenable 로 처리되어 영원히 풀리지 않는다 — 반드시 객체로 감싸서 반환한다.
  const { Capacitor, registerPlugin } = await import("@capacitor/core");
  if (Capacitor.isPluginAvailable("DibaySystemBack")) {
    if (!systemBackSource) systemBackSource = registerPlugin<NativeBackSource>("DibaySystemBack");
    return { source: systemBackSource };
  }
  const { App } = await import("@capacitor/app");
  return { source: App };
}

/** Default driver — Android only (DibaySystemBack, else @capacitor/app on older installs). */
const capacitorDriver: OverlayBackListenerDriver = {
  install(onBack) {
    if (resolveCapacitorShellPlatform() !== "android") return () => {};
    let removed = false;
    let handle: BackListenerHandle | null = null;
    let source: NativeBackSource | null = null;
    void resolveNativeBackSource()
      .then(async ({ source: src }) => {
        const h = await src.addListener("backButton", onBack);
        if (removed) {
          void h.remove();
          return;
        }
        handle = h;
        source = src;
        void src.setActive?.({ active: true }).catch(() => {});
      })
      .catch(() => {
        /* plugin missing — default back stays */
      });
    return () => {
      removed = true;
      void handle?.remove();
      void source?.setActive?.({ active: false }).catch(() => {});
    };
  },
};

function handleNativeBack(ev: { canGoBack?: boolean }): void {
  // 실기 FAIL-1 (2026-11-17): 네이티브 인트로가 덮고 있는 동안 ◁ 의 주인은 인트로(네이티브 = 건너뛰기) 하나 —
  // 인트로 아래 웹 화면(오버레이 닫기·알림 이동 뒤로·기록 뒤로)은 움직이지 않는다(이중 방어).
  if (isNativeIntroActive()) return;
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
