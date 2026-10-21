"use client";

import { useSyncExternalStore } from "react";
import {
  readSamarketShellKeyboardBottomInsetCssPx,
  subscribeSamarketShellKeyboardInsets,
} from "@/lib/platform/samarket-shell-keyboard";
import {
  detectFormKeyboardRuntimeContext,
  resolveFormAdapterKeyboardOcclusionInsetPx,
} from "@/lib/ui/form-keyboard-platform-adapter";
import {
  buildFormKeyboardViewportSnapshot,
  resolveFormLayoutWidthPx,
  resolveFormVisualViewportFrame,
  type FormKeyboardViewportSnapshot,
} from "@/lib/ui/form-keyboard-viewport-contract";

const CLOSED_SNAPSHOT: FormKeyboardViewportSnapshot = {
  keyboardOpen: false,
  visualViewportHeight: 0,
  visualViewportOffsetTop: 0,
  effectiveViewportBottom: 0,
  keyboardOcclusionInset: 0,
  safeBottom: 0,
  effectiveBottomInset: 0,
};

/**
 * ONE shared measurement for every consumer (root probe · footers · sheets).
 * Listeners attach once while ≥1 subscriber exists — no per-component visualViewport
 * listeners, no per-component closed baseline (a sheet opened while the IME is already up
 * shares the baseline taken before the keyboard opened).
 */
type Listener = () => void;

const listeners = new Set<Listener>();
let snapshot: FormKeyboardViewportSnapshot = CLOSED_SNAPSHOT;
let baselineClosedHeightPx = 0;
let baselineLayoutWidthPx = 0;
let detach: (() => void) | null = null;

function sameSnapshot(a: FormKeyboardViewportSnapshot, b: FormKeyboardViewportSnapshot): boolean {
  return (
    a.keyboardOpen === b.keyboardOpen &&
    a.visualViewportHeight === b.visualViewportHeight &&
    a.visualViewportOffsetTop === b.visualViewportOffsetTop &&
    a.effectiveViewportBottom === b.effectiveViewportBottom &&
    a.keyboardOcclusionInset === b.keyboardOcclusionInset &&
    a.safeBottom === b.safeBottom &&
    a.effectiveBottomInset === b.effectiveBottomInset &&
    a.runtimeContext?.keyboardModel === b.runtimeContext?.keyboardModel &&
    a.runtimeContext?.orientation === b.runtimeContext?.orientation
  );
}

function measure(): void {
  const runtimeContext = detectFormKeyboardRuntimeContext();
  const nativeShellInsetPx = readSamarketShellKeyboardBottomInsetCssPx();
  const keyboardOcclusionInsetOverride = resolveFormAdapterKeyboardOcclusionInsetPx(
    runtimeContext,
    { nativeShellInsetPx }
  );
  const next = buildFormKeyboardViewportSnapshot({
    baselineClosedHeightPx,
    baselineLayoutWidthPx,
    nativeShellInsetPx,
    safeBottomPx: runtimeContext.safeBottomPx,
    keyboardOcclusionInsetOverride,
    runtimeContext,
  });
  baselineClosedHeightPx = next.baselineClosedHeightPx;
  baselineLayoutWidthPx = next.baselineLayoutWidthPx;
  const published: FormKeyboardViewportSnapshot = {
    keyboardOpen: next.keyboardOpen,
    visualViewportHeight: next.visualViewportHeight,
    visualViewportOffsetTop: next.visualViewportOffsetTop,
    effectiveViewportBottom: next.effectiveViewportBottom,
    keyboardOcclusionInset: next.keyboardOcclusionInset,
    safeBottom: next.safeBottom,
    effectiveBottomInset: next.effectiveBottomInset,
    runtimeContext: next.runtimeContext,
  };
  if (sameSnapshot(snapshot, published)) return;
  snapshot = published;
  for (const l of listeners) l();
}

function attach(): () => void {
  if (baselineClosedHeightPx <= 0) {
    baselineClosedHeightPx = resolveFormVisualViewportFrame().heightPx;
    baselineLayoutWidthPx = resolveFormLayoutWidthPx();
  }
  let raf = 0;
  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        pending = false;
        measure();
      });
    });
  };

  const vv = window.visualViewport;
  vv?.addEventListener("resize", schedule);
  vv?.addEventListener("scroll", schedule);
  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);
  const unsub = subscribeSamarketShellKeyboardInsets(schedule);

  return () => {
    cancelAnimationFrame(raf);
    vv?.removeEventListener("resize", schedule);
    vv?.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    window.removeEventListener("orientationchange", schedule);
    unsub();
  };
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (!detach && typeof window !== "undefined") {
    detach = attach();
    measure();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && detach) {
      detach();
      detach = null;
    }
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => CLOSED_SNAPSHOT;
const subscribeNone = () => () => {};

/**
 * Form (TYPE B) keyboard / viewport authority.
 * Consumers apply `effectiveBottomInset` only — do not add `--safe-bottom` again.
 * Geometry is adapter-local (HARD LOCK: one UX contract ≠ one formula).
 */
export function useFormKeyboardViewport(options?: { enabled?: boolean }): FormKeyboardViewportSnapshot {
  const enabled = options?.enabled !== false;
  const snap = useSyncExternalStore(
    enabled ? subscribe : subscribeNone,
    enabled ? getSnapshot : getServerSnapshot,
    getServerSnapshot
  );
  return enabled ? snap : CLOSED_SNAPSHOT;
}

/** Test-only — reset the shared store between cases. */
export function __resetFormKeyboardViewportStoreForTests(): void {
  detach?.();
  detach = null;
  listeners.clear();
  snapshot = CLOSED_SNAPSHOT;
  baselineClosedHeightPx = 0;
  baselineLayoutWidthPx = 0;
}
