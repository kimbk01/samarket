"use client";

/**
 * iOS 앱 — 채팅 첫 진입 시 통화·알림 권한을 미리 묻는다 (Owner 승인 2026-11-08 · 「알림·마이크·카메라 승인 요청 화면」).
 *
 * 왜: iOS 수신 수락 경로(`DibayVoiceMicrophonePermission.ensureGranted`)는 권한이 「아직 안 물어봄」이면
 * 받는 순간 OS 창을 띄우고, 앱 화면 20초·잠금/백그라운드 3초 안에 허용이 없으면 서버에 거절을 보낸다.
 * 2026-11-08 01:47 PHT 통화 20f28db1… 이 이 경로로 「거절」 처리됨(ringing→declined 20.7초, accepted 없음).
 * 영상 통화는 카메라도 같은 방식(`DibayVideoMediaPermission`)이라 함께 미리 묻는다.
 * 알림은 앱 전체 단일 요청 경로(`requestNotificationFromGuide`, LOCK)만 쓴다.
 * 받는 순간의 네이티브 동작은 바꾸지 않는다.
 *
 * 범위: iOS 네이티브 셸만. Android·웹 브라우저는 아무것도 하지 않는다.
 */

import {
  checkNativeCallOsPermissions,
  requestNativeCallMediaPermissions,
} from "@/lib/call/native/native-call-permissions";
import {
  canRequestOsNotificationPrompt,
  requestNotificationFromGuide,
  syncNotificationState,
} from "@/lib/permissions/permission-manager/notification-permission-manager";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

/** 한 앱 실행(세션) 안에서 안내를 한 번만 띄운다 — OS 가 답을 받으면 상태가 바뀌어 다시 뜨지 않는다. */
export const IOS_MIC_PREASK_SESSION_KEY = "cm_ios_mic_preask_shown_v1";

/** 네이티브 플러그인에 넘기는 식별값 — 실제 통화 세션이 아님(로그 구분용). */
export const IOS_MIC_PREASK_PROBE_ID = "mic_preask_messenger_entry";

export type IosPermissionPreaskNeeds = {
  notification: boolean;
  microphone: boolean;
  camera: boolean;
};

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

export function hasAnyPreaskNeed(needs: IosPermissionPreaskNeeds): boolean {
  return needs.notification || needs.microphone || needs.camera;
}

/**
 * 아직 OS 에 묻지 않은 권한 — iOS 셸 + 이번 실행 첫 회일 때만 계산. 아니면 모두 false.
 * 이미 허용·거부된 권한은 묻지 않는다(거부는 기존 「설정에서 허용」 안내 경로).
 */
export async function resolveIosPermissionPreaskNeeds(): Promise<IosPermissionPreaskNeeds> {
  const none: IosPermissionPreaskNeeds = { notification: false, microphone: false, camera: false };
  if (typeof window === "undefined") return none;
  if (!isIosNativeShell()) return none;
  if (readShownThisSession()) return none;
  const [media, notif] = await Promise.all([
    checkNativeCallOsPermissions(),
    syncNotificationState().catch(() => null),
  ]);
  return {
    notification: Boolean(notif && !notif.receiveReady && canRequestOsNotificationPrompt(notif)),
    microphone: media.microphone === "prompt_available",
    camera: media.camera === "prompt_available",
  };
}

/** @deprecated 호환 — {@link resolveIosPermissionPreaskNeeds} */
export async function shouldShowIosMicPreask(): Promise<boolean> {
  return hasAnyPreaskNeed(await resolveIosPermissionPreaskNeeds());
}

/**
 * 「계속」 — 필요한 iOS 시스템 창을 차례로 띄운다: 알림 → 마이크 → 카메라.
 * 마이크·카메라는 네이티브 한 번 호출(video = 마이크 다음 카메라)로 묻는다. 결과는 OS 가 기록한다.
 */
export async function requestIosPermissionsFromPreask(needs: IosPermissionPreaskNeeds): Promise<void> {
  if (!isIosNativeShell()) return;
  if (needs.notification) {
    try {
      await requestNotificationFromGuide();
    } catch {
      /* 알림 실패가 마이크·카메라 요청을 막지 않는다 */
    }
  }
  if (needs.microphone || needs.camera) {
    await requestNativeCallMediaPermissions(needs.camera ? "video" : "voice", IOS_MIC_PREASK_PROBE_ID);
  }
}

/** @deprecated 호환 — 마이크만 */
export async function requestIosMicFromPreask(): Promise<void> {
  await requestIosPermissionsFromPreask({ notification: false, microphone: true, camera: false });
}
