"use client";

import {
  readCallEngineActiveVideoSession,
  readCallEngineAndroidOsPipSessionId,
  readCallEngineDockedSessionId,
  readCallEngineIosNativePipSessionId,
  readCallEngineMinimizedSessionId,
} from "@/lib/community-messenger/call-engine/call-engine-store";

/** 통화 표면 SSOT — 상호배타 (NONE = 표시 없음) */
export type CallPresentationSurface =
  | "FULLSCREEN"
  | "DOCK"
  | "ANDROID_OS_PIP"
  | "IOS_NATIVE_PIP"
  | "NONE";

export function resolveCallPresentationSurface(sessionId: string): CallPresentationSurface {
  const sid = sessionId.trim();
  if (!sid) return "NONE";
  if (readCallEngineAndroidOsPipSessionId() === sid) return "ANDROID_OS_PIP";
  if (readCallEngineIosNativePipSessionId() === sid) return "IOS_NATIVE_PIP";
  if (readCallEngineDockedSessionId() === sid) return "DOCK";
  if (readCallEngineMinimizedSessionId() === sid) return "DOCK";
  if (readCallEngineActiveVideoSession() === sid) return "FULLSCREEN";
  return "NONE";
}

export function readActiveCallPresentationSurface(): CallPresentationSurface {
  const sid =
    readCallEngineAndroidOsPipSessionId() ??
    readCallEngineIosNativePipSessionId() ??
    readCallEngineDockedSessionId() ??
    readCallEngineMinimizedSessionId() ??
    readCallEngineActiveVideoSession();
  if (!sid) return "NONE";
  return resolveCallPresentationSurface(sid);
}

export function isRetainedCallPresentationSurface(surface: CallPresentationSurface): boolean {
  return surface === "DOCK" || surface === "ANDROID_OS_PIP" || surface === "IOS_NATIVE_PIP";
}

export function shouldBlockCallRuntimeSurfaceReset(): boolean {
  const surface = readActiveCallPresentationSurface();
  return isRetainedCallPresentationSurface(surface);
}
