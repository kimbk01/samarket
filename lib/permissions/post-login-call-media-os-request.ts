"use client";

/**
 * iOS 앱 — 로그인 직후 OS 권한 창: 알림 다음에 마이크 → 카메라 (Owner 승인 2026-11-08 「A·B 둘 다」).
 * 앱 자체 안내 화면 없음(OS 창만 · 정책 OS-ONLY). 아직 안 물은 권한만 묻는다.
 * 2026-07-11 ef2633578 에서 로그인 직후 통화 권한 요청이 빠진 뒤, 첫 수신 통화 수락 순간 권한 창이 떠
 * 시간초과 거절(세션 20f28db1)이 났다 — 전화가 오기 전에 OS 창으로 정해 둔다.
 * 범위: iOS 네이티브 셸만. Android·웹 브라우저 무변경.
 */

import {
  checkNativeCallOsPermissions,
  requestNativeCallMediaPermissions,
} from "@/lib/call/native/native-call-permissions";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

/** 네이티브 로그 구분용 식별값 — 통화 세션 아님. */
export const POST_LOGIN_CALL_MEDIA_PROBE_ID = "post_login_call_media";

export type PostLoginCallMediaOsRequestResult = "skipped_not_ios" | "already_decided" | "requested";

/** 마이크·카메라 중 「아직 안 물어봄」이 있으면 OS 창(마이크 → 카메라)을 띄운다. */
export async function requestPostLoginCallMediaOsPermissions(): Promise<PostLoginCallMediaOsRequestResult> {
  if (!isCapacitorNativePlatform() || resolveCapacitorShellPlatform() !== "ios") return "skipped_not_ios";
  const snap = await checkNativeCallOsPermissions();
  const micPending = snap.microphone === "prompt_available";
  const camPending = snap.camera === "prompt_available";
  if (!micPending && !camPending) return "already_decided";
  await requestNativeCallMediaPermissions(camPending ? "video" : "voice", POST_LOGIN_CALL_MEDIA_PROBE_ID);
  return "requested";
}
