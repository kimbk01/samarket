/**
 * Single visualViewport + native keyboard listener for iOS form surfaces.
 * Multiple hooks subscribe; only one set of window listeners is attached.
 */

import {
  readSamarketShellKeyboardBottomInsetCssPx,
  subscribeSamarketShellKeyboardInsets,
} from "@/lib/platform/samarket-shell-keyboard";
import { isLikelyIosWebKit } from "@/lib/ui/is-likely-ios-webkit";
import {
  iosFormVisibleBandsEqual,
  isCmRoomKeyboardOwnerPresent,
  resolveIosFormVisibleBandPx,
  type IosFormVisibleBandPx,
} from "@/lib/ui/ios-form-keyboard-viewport-contract";

export type IosFormKeyboardViewportListener = (band: IosFormVisibleBandPx) => void;

type StoreState = {
  band: IosFormVisibleBandPx;
  consumerCount: number;
  started: boolean;
  unsubNative: (() => void) | null;
  syncRaf: number;
};

function closedBand(layoutHeightPx: number): IosFormVisibleBandPx {
  return {
    keyboardOpen: false,
    topPx: 0,
    heightPx: Math.max(200, Math.round(layoutHeightPx)),
    insetCssPx: 0,
    bandAuthority: "layout",
    owner: "none",
  };
}

const listeners = new Set<IosFormKeyboardViewportListener>();

const state: StoreState = {
  band: closedBand(typeof window !== "undefined" ? window.innerHeight : 800),
  consumerCount: 0,
  started: false,
  unsubNative: null,
  syncRaf: 0,
};

function measureBand(): IosFormVisibleBandPx {
  if (typeof window === "undefined") return closedBand(800);
  const vv = window.visualViewport;
  return resolveIosFormVisibleBandPx({
    isIosWebKit: isLikelyIosWebKit(),
    cmRoomShellPresent: isCmRoomKeyboardOwnerPresent(document),
    layoutHeightPx: window.innerHeight,
    visualViewport: vv ? { height: vv.height, offsetTop: vv.offsetTop } : null,
    nativeInsetCssPx: readSamarketShellKeyboardBottomInsetCssPx(),
  });
}

function emit(band: IosFormVisibleBandPx): void {
  if (iosFormVisibleBandsEqual(state.band, band)) return;
  state.band = band;
  for (const listener of listeners) {
    listener(band);
  }
}

function syncNow(): void {
  emit(measureBand());
}

function scheduleSync(): void {
  if (typeof window === "undefined") return;
  cancelAnimationFrame(state.syncRaf);
  state.syncRaf = requestAnimationFrame(() => {
    state.syncRaf = requestAnimationFrame(() => {
      state.syncRaf = 0;
      syncNow();
    });
  });
}

function onVvOrWin(): void {
  scheduleSync();
}

function startListening(): void {
  if (state.started || typeof window === "undefined") return;
  state.started = true;
  const vv = window.visualViewport;
  vv?.addEventListener("resize", onVvOrWin);
  vv?.addEventListener("scroll", onVvOrWin);
  window.addEventListener("resize", onVvOrWin);
  window.addEventListener("orientationchange", onVvOrWin);
  state.unsubNative = subscribeSamarketShellKeyboardInsets(scheduleSync);
  syncNow();
}

function stopListening(): void {
  if (!state.started || typeof window === "undefined") return;
  state.started = false;
  cancelAnimationFrame(state.syncRaf);
  state.syncRaf = 0;
  const vv = window.visualViewport;
  vv?.removeEventListener("resize", onVvOrWin);
  vv?.removeEventListener("scroll", onVvOrWin);
  window.removeEventListener("resize", onVvOrWin);
  window.removeEventListener("orientationchange", onVvOrWin);
  state.unsubNative?.();
  state.unsubNative = null;
  emit(closedBand(window.innerHeight));
}

/** Active form surface count — store listens while > 0. */
export function acquireIosFormKeyboardViewport(
  listener: IosFormKeyboardViewportListener
): () => void {
  listeners.add(listener);
  state.consumerCount += 1;
  if (state.consumerCount === 1) startListening();
  listener(state.band);
  return () => {
    listeners.delete(listener);
    state.consumerCount = Math.max(0, state.consumerCount - 1);
    if (state.consumerCount === 0) stopListening();
  };
}

export function getIosFormKeyboardViewportBand(): IosFormVisibleBandPx {
  return state.band;
}

export function getIosFormKeyboardViewportConsumerCount(): number {
  return state.consumerCount;
}

/** Test-only reset */
export function __resetIosFormKeyboardViewportStoreForTests(): void {
  listeners.clear();
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(state.syncRaf);
  }
  state.syncRaf = 0;
  state.consumerCount = 0;
  state.started = false;
  state.unsubNative?.();
  state.unsubNative = null;
  state.band = closedBand(800);
}
