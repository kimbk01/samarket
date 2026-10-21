"use client";

import { useSyncExternalStore } from "react";
import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
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
  isFormKeyboardInputSurfaceElement,
  readAndroidNativeImeHiddenEvidence,
  resolveFormKeyboardBaselineOnWidthChange,
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
/** Baseline carried across a rotation with the keyboard open — replaced by the first closed measure. */
let baselineEstimated = false;
/** Measured closed height per layout width (rotation back and forth reuses the exact value). */
const closedHeightByWidth = new Map<number, number>();
const CLOSED_HEIGHT_MEMORY = 4;
let detach: (() => void) | null = null;

function rememberClosedHeight(widthPx: number, heightPx: number): void {
  if (!(widthPx > 0 && heightPx > 0)) return;
  closedHeightByWidth.delete(widthPx);
  closedHeightByWidth.set(widthPx, heightPx);
  while (closedHeightByWidth.size > CLOSED_HEIGHT_MEMORY) {
    const oldest = closedHeightByWidth.keys().next().value;
    if (oldest === undefined) break;
    closedHeightByWidth.delete(oldest);
  }
}

function readNativeImeHidden(): boolean {
  if (typeof document === "undefined") return false;
  if (resolveCapacitorShellPlatform() !== "android") return false;
  return readAndroidNativeImeHiddenEvidence(document.documentElement.style);
}

function readInputSurfaceFocused(): boolean {
  if (typeof document === "undefined") return false;
  return isFormKeyboardInputSurfaceElement(document.activeElement as HTMLInputElement | null);
}

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
  const inputSurfaceFocused = readInputSurfaceFocused();
  const nativeImeHidden = readNativeImeHidden();
  const layoutWidthPx = resolveFormLayoutWidthPx();
  if (layoutWidthPx > 0 && baselineLayoutWidthPx > 0 && layoutWidthPx !== baselineLayoutWidthPx) {
    // KB-04 · defect A — resolve the new width's baseline here (build then sees the same width).
    const next = resolveFormKeyboardBaselineOnWidthChange({
      layoutWidthPx,
      frameHeightPx: resolveFormVisualViewportFrame().heightPx,
      knownClosedHeightPx: closedHeightByWidth.get(layoutWidthPx) ?? null,
      prevBaselineClosedHeightPx: baselineClosedHeightPx,
      prevBaselineLayoutWidthPx: baselineLayoutWidthPx,
      prevBaselineEstimated: baselineEstimated,
      wasKeyboardOpen: snapshot.keyboardOpen && !nativeImeHidden,
      inputSurfaceFocused,
    });
    baselineClosedHeightPx = next.baselineClosedHeightPx;
    baselineEstimated = next.baselineEstimated;
    baselineLayoutWidthPx = layoutWidthPx;
  }
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
    inputSurfaceFocused,
    baselineEstimated,
    nativeImeHidden,
  });
  baselineClosedHeightPx = next.baselineClosedHeightPx;
  baselineLayoutWidthPx = next.baselineLayoutWidthPx;
  if (!next.keyboardOpen) {
    baselineEstimated = false;
    rememberClosedHeight(baselineLayoutWidthPx, baselineClosedHeightPx);
  }
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
  // Focus is a gate for "open" — re-evaluate when it moves (no polling, no timers).
  document.addEventListener("focusin", schedule, true);
  document.addEventListener("focusout", schedule, true);
  const unsub = subscribeSamarketShellKeyboardInsets(schedule);
  // Android: Capacitor SystemBars rewrites <html> style on every insets pass (IME show/hide).
  let styleObserver: MutationObserver | null = null;
  if (resolveCapacitorShellPlatform() === "android" && typeof MutationObserver !== "undefined") {
    styleObserver = new MutationObserver(schedule);
    styleObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
  }

  return () => {
    styleObserver?.disconnect();
    document.removeEventListener("focusin", schedule, true);
    document.removeEventListener("focusout", schedule, true);
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
  baselineEstimated = false;
  closedHeightByWidth.clear();
}
