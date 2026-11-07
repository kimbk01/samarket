"use client";

/**
 * iOS 앱 — 채팅 첫 진입 시 마이크 권한을 미리 묻는다 (Owner 승인 2026-11-08).
 *
 * 왜: iOS 수신 수락 경로(`DibayVoiceMicrophonePermission.ensureGranted`)는 권한이 「아직 안 물어봄」이면
 * 받는 순간 OS 창을 띄우고, 앱 화면 20초·잠금/백그라운드 3초 안에 허용이 없으면 서버에 거절을 보낸다.
 * 2026-11-08 01:47 PHT 통화 20f28db1… 이 이 경로로 「거절」 처리됨(ringing→declined 20.7초, accepted 없음).
 * 전화가 오기 전에 권한을 정해 두면 이 경로를 타지 않는다. 받는 순간의 네이티브 동작은 바꾸지 않는다.
 *
 * 범위: iOS 네이티브 셸만. Android·웹 브라우저는 아무것도 하지 않는다.
 */

import {
  checkNativeCallOsPermissions,
  requestNativeCallMediaPermissions,
} from "@/lib/call/native/native-call-permissions";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

/** 한 앱 실행(세션) 안에서 안내를 한 번만 띄운다 — OS 가 답을 받으면 상태가 바뀌어 다시 뜨지 않는다. */
export const IOS_MIC_PREASK_SESSION_KEY = "cm_ios_mic_preask_shown_v1";

/** 네이티브 플러그인에 넘기는 식별값 — 실제 통화 세션이 아님(로그 구분용). */
export const IOS_MIC_PREASK_PROBE_ID = "mic_preask_messenger_entry";

export function isIosNativeShell(): boolean {
  return isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "ios";
}

function readShownThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(IOS_MIC_PREASK_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function markIosMicPreaskShown(): void {
  try {
    window.sessionStorage.setItem(IOS_MIC_PREASK_SESSION_KEY, "1");
  } catch {
    /* private mode — 다음 진입에 다시 볼 수 있음(권한이 정해지면 안 뜸) */
  }
}

/** 안내를 띄울지 — iOS 셸 + 마이크가 「아직 안 물어봄(prompt_available)」 + 이번 실행에서 처음. */
export async function shouldShowIosMicPreask(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!isIosNativeShell()) return false;
  if (readShownThisSession()) return false;
  const snap = await checkNativeCallOsPermissions();
  return snap.microphone === "prompt_available";
}

/** 「계속」 — iOS 시스템 마이크 권한 창을 띄운다. 결과(허용/거부)는 OS 가 기록한다. */
export async function requestIosMicFromPreask(): Promise<void> {
  if (!isIosNativeShell()) return;
  await requestNativeCallMediaPermissions("voice", IOS_MIC_PREASK_PROBE_ID);
}
