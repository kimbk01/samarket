"use client";

export type CallEngineAppVisibility = "foreground" | "background" | "locked" | "unknown";

/** Web + document visibility 기준 앱 노출 상태 (수신 surface owner 정책 SSOT). */
export function resolveCallEngineAppVisibility(
  visibilityState?: DocumentVisibilityState | string | null,
): CallEngineAppVisibility {
  if (typeof document === "undefined") return "unknown";
  const vis = (visibilityState ?? document.visibilityState) as DocumentVisibilityState;
  if (vis === "visible") return "foreground";
  if (vis === "hidden") return "background";
  return "unknown";
}

export function shouldUseWebIncomingBanner(appVisibility: CallEngineAppVisibility): boolean {
  return appVisibility === "foreground";
}

export function shouldPreferNativeIncomingSurface(appVisibility: CallEngineAppVisibility): boolean {
  return appVisibility === "background" || appVisibility === "locked";
}
