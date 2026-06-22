"use client";

import { resolveCallPresentationSurface } from "@/lib/community-messenger/call-presentation-surface";
import { readCallEngineAndroidOsPipSessionId } from "@/lib/community-messenger/call-engine/call-engine-store";

/** Android OS PiP — WebView 축소 시 최소 레이아웃 SSOT (IOS_NATIVE_PIP 제외) */
export function readAndroidOsPipSafeLayoutSessionId(): string | null {
  return readCallEngineAndroidOsPipSessionId();
}

export function isAndroidOsPipSafeLayoutActive(sessionId?: string | null): boolean {
  const active = readCallEngineAndroidOsPipSessionId();
  if (!active) return false;
  const sid = sessionId?.trim();
  if (sid) return active === sid;
  return true;
}

export function shouldUseAndroidOsPipSafeLayout(sessionId: string): boolean {
  const sid = sessionId.trim();
  if (!sid) return false;
  return resolveCallPresentationSurface(sid) === "ANDROID_OS_PIP";
}
