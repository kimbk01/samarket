import {
  inferCommunityMessengerMediaGrantedFromDeviceLabels,
} from "@/lib/community-messenger/media-permissions-query";
import {
  isPermissionFeatureCompleted,
  markPermissionFeatureCompleted,
} from "@/lib/permissions/device-permission-manager";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { ensureOutgoingCallMediaPermission, openCallMediaPermissionSettings } from "@/lib/community-messenger/call-media-permission-preflight";
import { acquirePrimedCommunityMessengerStream } from "@/lib/community-messenger/call-media-stream";
import { isCallMediaGrantedSync } from "@/lib/permissions/dibay-device-permission-store";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import type { MessageKey } from "@/lib/i18n/messages";

function featureKeyForCallKind(kind: CommunityMessengerCallKind): "messenger_voice_call" | "messenger_video_call" {
  return kind === "video" ? "messenger_video_call" : "messenger_voice_call";
}

export function markCommunityMessengerMediaTrustedOnce(kind: CommunityMessengerCallKind = "voice"): void {
  markPermissionFeatureCompleted(featureKeyForCallKind(kind));
}

export function hasCommunityMessengerMediaTrustedMark(kind: CommunityMessengerCallKind = "voice"): boolean {
  return isPermissionFeatureCompleted(featureKeyForCallKind(kind));
}

/** 중앙 call_media store + (통화 중) primed stream 만 — legacy trusted·Permissions 캐시 제외 */
export function isCommunityMessengerCallMediaReadySync(kind: CommunityMessengerCallKind): boolean {
  if (typeof window === "undefined") return false;
  return hasUsablePrimedCommunityMessengerDeviceStream(kind) || isCallMediaGrantedSync(kind);
}

function markTrustedIfBrowserGranted(
  kind: CommunityMessengerCallKind,
  states: { microphone: PermissionState | null; camera?: PermissionState | null }
): boolean {
  const micGranted = states.microphone === "granted";
  const cameraGranted = kind !== "video" || states.camera === "granted";
  if (!micGranted || !cameraGranted) return false;
  markCommunityMessengerMediaTrustedOnce(kind);
  return true;
}

const PERMISSIONS_QUERY_BUDGET_MS = 380;

async function readPermissionStateBudgeted(
  query: () => Promise<PermissionStatus>
): Promise<PermissionState | null> {
  try {
    const r = await Promise.race([
      query(),
      new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), PERMISSIONS_QUERY_BUDGET_MS);
      }),
    ]);
    if (!r) return null;
    return r.state;
  } catch {
    return null;
  }
}

type PrimedDeviceStreamState = {
  kind: CommunityMessengerCallKind;
  stream: MediaStream;
  /** `null` — live 통화 중 idle 자동 해제 일시 중단 */
  timeoutId: number | null;
} | null;

let primedDeviceStreamState: PrimedDeviceStreamState = null;
/** `suspendPrimed…` 중에는 `storePrimedStream` 이 idle TTL 을 다시 걸지 않는다 */
let primedIdleReleaseSuspended = false;

const PRIMED_STREAM_IDLE_RELEASE_MS = 90_000;

function callPermissionT(key: MessageKey, fallbackKo: string, fallbackEn: string): string {
  return safeTranslate(getRuntimeAppLanguage(), key, { fallbackKo, fallbackEn });
}

export function getCommunityMessengerPermissionGuide(kind: CommunityMessengerCallKind): {
  description: string;
  retryLabel: string;
  settingsLabel: string;
} {
  return {
    description:
      kind === "video"
        ? callPermissionT(
            "permission_call_guide_video_desc",
            "브라우저 또는 기기 설정에서 카메라와 마이크를 허용해 주세요.",
            "Allow camera and microphone in browser or device settings.",
          )
        : callPermissionT(
            "permission_call_guide_voice_desc",
            "브라우저 또는 기기 설정에서 마이크를 허용해 주세요.",
            "Allow microphone in browser or device settings.",
          ),
    retryLabel:
      kind === "video"
        ? callPermissionT("permission_call_retry_video", "카메라/마이크 확인", "Check camera/microphone")
        : callPermissionT("permission_call_retry_voice", "마이크 확인", "Check microphone"),
    settingsLabel: callPermissionT("permission_call_settings_label", "권한 설정 안내", "Permission setup guide"),
  };
}

export function openCommunityMessengerPermissionSettings(): boolean {
  return openCallMediaPermissionSettings();
}

function clearPrimedDeviceStreamTimeout() {
  if (!primedDeviceStreamState?.timeoutId) return;
  window.clearTimeout(primedDeviceStreamState.timeoutId);
  primedDeviceStreamState.timeoutId = null;
}

function armPrimedDeviceStreamIdleRelease(idleMs = PRIMED_STREAM_IDLE_RELEASE_MS) {
  if (!primedDeviceStreamState || typeof window === "undefined") return;
  clearPrimedDeviceStreamTimeout();
  primedDeviceStreamState.timeoutId = window.setTimeout(() => {
    clearPrimedDeviceStream(true);
  }, idleMs);
}

function clearPrimedDeviceStream(stopTracks: boolean) {
  if (!primedDeviceStreamState) return;
  clearPrimedDeviceStreamTimeout();
  if (stopTracks) {
    for (const track of primedDeviceStreamState.stream.getTracks()) {
      track.stop();
    }
  }
  primedDeviceStreamState = null;
}

/**
 * 링·통화 화면 동안 프라임 GUM 스트림이 90초 idle TTL 로 `track.stop()` 되지 않게 한다.
 * `consumePrimed`·`discardPrimed`·통화 종료 시 `resume…` 으로 idle 해제를 복구한다.
 */
export function suspendPrimedCommunityMessengerDeviceStreamIdleRelease(): void {
  primedIdleReleaseSuspended = true;
  clearPrimedDeviceStreamTimeout();
}

export function resumePrimedCommunityMessengerDeviceStreamIdleRelease(
  idleMs = PRIMED_STREAM_IDLE_RELEASE_MS
): void {
  primedIdleReleaseSuspended = false;
  armPrimedDeviceStreamIdleRelease(idleMs);
}

function primedStreamIsUsableForKind(kind: CommunityMessengerCallKind): boolean {
  if (!primedDeviceStreamState || primedDeviceStreamState.kind !== kind) return false;
  const stream = primedDeviceStreamState.stream;
  const tracks = stream.getTracks();
  if (tracks.length === 0 || !tracks.every((t) => t.readyState === "live")) return false;
  if (kind === "video") {
    return stream.getVideoTracks().some((t) => t.readyState === "live");
  }
  return stream.getAudioTracks().some((t) => t.readyState === "live");
}

/** 전역 수락 직후 방으로 이동했을 때 자동 수락 effect 가 getUserMedia 를 호출해도 되는지(프라임 성공 여부) */
export function hasUsablePrimedCommunityMessengerDeviceStream(kind: CommunityMessengerCallKind): boolean {
  return primedStreamIsUsableForKind(kind);
}

/** 재프라임 직전: 다른 kind·ended primed 만 정리(usable 동일 kind 는 유지) */
export function shouldDiscardPrimedBeforeCommunityMessengerPrime(kind: CommunityMessengerCallKind): boolean {
  if (!primedDeviceStreamState) return false;
  return !primedStreamIsUsableForKind(kind);
}

/** @deprecated `isCommunityMessengerCallMediaReadySync` 사용 */
export function shouldSkipCallerMediaGateOverlaySync(kind: CommunityMessengerCallKind): boolean {
  return isCommunityMessengerCallMediaReadySync(kind);
}

/**
 * 발신 통화의 「마이크·카메라 허용」 전체 화면 확인을 건너뛸지.
 * - 이전에 성공적으로 허용한 기록(localStorage) 또는
 * - 채팅방 클릭 직후 프라임된 스트림이 아직 유효한 경우
 * - Permissions API 로 이미 granted 인 경우(쿼리는 상한 ms — 일부 환경에서 수 초 걸려 연결 화면이 늦게 뜨는 문제 방지)
 */
async function skipCallerGateFromDeviceLabelsOrTrusted(
  kind: CommunityMessengerCallKind,
  trusted: boolean
): Promise<boolean> {
  if (trusted) return true;
  const inferred = await inferCommunityMessengerMediaGrantedFromDeviceLabels(kind);
  if (!inferred) return false;
  markCommunityMessengerMediaTrustedOnce(kind);
  return true;
}

/** async: sync ready + Permissions API·enumerateDevices 라벨 추론 */
export async function resolveCommunityMessengerCallMediaReady(kind: CommunityMessengerCallKind): Promise<boolean> {
  if (isCommunityMessengerCallMediaReadySync(kind)) return true;
  if (typeof window === "undefined") return false;
  const perm = navigator.permissions;
  const trusted = hasCommunityMessengerMediaTrustedMark(kind);
  if (!perm?.query) {
    return skipCallerGateFromDeviceLabelsOrTrusted(kind, trusted);
  }
  try {
    const micState = await readPermissionStateBudgeted(() => perm.query({ name: "microphone" as PermissionName }));
    if (micState === "denied") return false;
    if (micState == null) {
      return skipCallerGateFromDeviceLabelsOrTrusted(kind, trusted);
    }
    if (kind === "video") {
      const camState = await readPermissionStateBudgeted(() => perm.query({ name: "camera" as PermissionName }));
      if (camState === "denied") return false;
      if (camState == null) {
        return skipCallerGateFromDeviceLabelsOrTrusted(kind, trusted);
      }
      if (trusted) return true;
      return markTrustedIfBrowserGranted(kind, { microphone: micState, camera: camState });
    }
    if (trusted) return true;
    return markTrustedIfBrowserGranted(kind, { microphone: micState });
  } catch {
    return skipCallerGateFromDeviceLabelsOrTrusted(kind, trusted);
  }
}

/** @deprecated `resolveCommunityMessengerCallMediaReady` 사용 */
export async function shouldSkipCallerMediaGateOverlay(kind: CommunityMessengerCallKind): Promise<boolean> {
  return resolveCommunityMessengerCallMediaReady(kind);
}

function storePrimedStream(kind: CommunityMessengerCallKind, stream: MediaStream) {
  if (typeof window === "undefined") return;
  primedDeviceStreamState = {
    kind,
    stream,
    timeoutId: null,
  };
  /** 방↔통화 이동·토큰 요청 등으로 조인이 늦어져도 한 번 허용한 스트림을 재사용할 수 있게 여유를 둔다 */
  if (!primedIdleReleaseSuspended) {
    armPrimedDeviceStreamIdleRelease();
  }
}

export function storePrimedCommunityMessengerDeviceStream(
  kind: CommunityMessengerCallKind,
  stream: MediaStream
): void {
  storePrimedStream(kind, stream);
}

/**
 * 사용자 제스처 시 영상 GUM 프라임 — 발신 미리보기·Agora 조인용.
 */
export async function primeCommunityMessengerDevicePermissionFromUserGesture(
  kind: CommunityMessengerCallKind
): Promise<void> {
  const result = await ensureOutgoingCallMediaPermission(kind);
  if (!result.ok) {
    throw new DOMException("Media permission unavailable", "NotAllowedError");
  }
  if (kind === "video") {
    const stream = await acquirePrimedCommunityMessengerStream("video");
    storePrimedStream("video", stream);
  }
}

export async function primeCommunityMessengerDevicePermission(kind: CommunityMessengerCallKind): Promise<void> {
  await primeCommunityMessengerDevicePermissionFromUserGesture(kind);
}

/**
 * 프라임된 스트림을 소비하지 않고 참조만 한다(링 단계 HTML 미리보기 등).
 * `consumePrimedCommunityMessengerDevicePermission` 직전에 같은 트랙을 화면에 붙였다면 조인 직전 `srcObject` 해제 권장.
 */
export function peekPrimedCommunityMessengerDeviceStream(kind: CommunityMessengerCallKind): MediaStream | null {
  if (typeof window === "undefined" || !primedDeviceStreamState) return null;
  if (primedDeviceStreamState.kind !== kind) return null;
  return primedDeviceStreamState.stream;
}

export function consumePrimedCommunityMessengerDevicePermission(
  kind: CommunityMessengerCallKind
): MediaStream | null {
  if (typeof window === "undefined" || !primedDeviceStreamState) return null;
  if (primedDeviceStreamState.kind !== kind) return null;
  const stream = primedDeviceStreamState.stream;
  clearPrimedDeviceStream(false);
  return stream;
}

export function discardPrimedCommunityMessengerDevicePermission() {
  if (typeof window === "undefined") return;
  clearPrimedDeviceStream(true);
}
