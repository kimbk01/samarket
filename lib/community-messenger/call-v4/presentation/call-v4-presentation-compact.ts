"use client";

import { resolveCallPresentationSurface } from "@/lib/community-messenger/call-presentation-surface";

/**
 * Compact presentation — OS PiP or equivalent minimal chrome.
 * Shared across Android OS PiP and iOS native PiP (when active).
 */
export function isCallV4CompactPresentationActive(callId: string): boolean {
  const sid = callId.trim();
  if (!sid) return false;
  const surface = resolveCallPresentationSurface(sid);
  return surface === "ANDROID_OS_PIP" || surface === "IOS_NATIVE_PIP";
}

export function shouldSuppressCallV4FloatingDock(callId: string): boolean {
  return isCallV4CompactPresentationActive(callId);
}
