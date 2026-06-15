import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import {
  queryCommunityMessengerMediaPermissions,
  type CommunityMessengerMediaPermissionSnapshot,
} from "@/lib/community-messenger/media-permissions-query";
import { isCallMediaGrantedSync } from "@/lib/permissions/dibay-device-permission-store";

export type { CommunityMessengerMediaPermissionSnapshot };
export { queryCommunityMessengerMediaPermissions };

const LS_AUDIO = "cm_messenger_preferred_audio_input_id";
const LS_VIDEO = "cm_messenger_preferred_video_input_id";

/** localhost·127.0.0.1 은 예외, 그 외 비 HTTPS 는 getUserMedia 불가 */
export function isCommunityMessengerMediaSecureContext(): boolean {
  if (typeof window === "undefined") return true;
  if (window.isSecureContext) return true;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
}

export function readPreferredCommunityMessengerDeviceIds(): {
  audioDeviceId: string | null;
  videoDeviceId: string | null;
} {
  if (typeof window === "undefined") return { audioDeviceId: null, videoDeviceId: null };
  try {
    return {
      audioDeviceId: window.localStorage.getItem(LS_AUDIO),
      videoDeviceId: window.localStorage.getItem(LS_VIDEO),
    };
  } catch {
    return { audioDeviceId: null, videoDeviceId: null };
  }
}

export function writePreferredCommunityMessengerDeviceIds(audioDeviceId: string | null, videoDeviceId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (audioDeviceId) window.localStorage.setItem(LS_AUDIO, audioDeviceId);
    else window.localStorage.removeItem(LS_AUDIO);
    if (videoDeviceId) window.localStorage.setItem(LS_VIDEO, videoDeviceId);
    else window.localStorage.removeItem(LS_VIDEO);
  } catch {
    /* private mode */
  }
}

export function persistDeviceIdsFromMediaStream(stream: MediaStream): void {
  const a = stream.getAudioTracks()[0]?.getSettings().deviceId;
  const v = stream.getVideoTracks()[0]?.getSettings().deviceId;
  const cur = readPreferredCommunityMessengerDeviceIds();
  writePreferredCommunityMessengerDeviceIds(a ?? cur.audioDeviceId, v ?? cur.videoDeviceId);
}

/** 권한 확보 후 목록이 채워지면 첫 번째 장치를 기본으로 고정(저장값이 없거나 무효할 때) */
export async function refreshPreferredCommunityMessengerDevicesFromEnumerate(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
  const list = await navigator.mediaDevices.enumerateDevices();
  const audioInputs = list.filter((d) => d.kind === "audioinput" && d.deviceId);
  const videoInputs = list.filter((d) => d.kind === "videoinput" && d.deviceId);
  const cur = readPreferredCommunityMessengerDeviceIds();
  const a =
    cur.audioDeviceId && audioInputs.some((d) => d.deviceId === cur.audioDeviceId)
      ? cur.audioDeviceId
      : (audioInputs[0]?.deviceId ?? null);
  const v =
    cur.videoDeviceId && videoInputs.some((d) => d.deviceId === cur.videoDeviceId)
      ? cur.videoDeviceId
      : (videoInputs[0]?.deviceId ?? null);
  writePreferredCommunityMessengerDeviceIds(a, v);
}

export type CommunityMessengerPreflightResult =
  | { ok: true }
  | { ok: false; code: "insecure_context" | "no_mediadevices" | "denied" | "gum_failed" };

export type CommunityMessengerEntryMediaPreflightOptions = {
  /** @deprecated 통화 권한은 DiBaYCallMediaOnboardingGate 에서만 요청 — 진입 시 check-only */
  allowPermissionPrompt?: boolean;
};

/**
 * 메신저 진입 시 check-only — 중앙 call_media store 가 granted 일 때만 장치 목록을 갱신한다.
 * GUM·OS 권한 프롬프트는 호출하지 않는다 (온보딩 게이트 전용).
 */
export async function runCommunityMessengerEntryMediaPreflight(
  _opts?: CommunityMessengerEntryMediaPreflightOptions
): Promise<CommunityMessengerPreflightResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return { ok: false, code: "no_mediadevices" };
  }
  if (!isCommunityMessengerMediaSecureContext()) {
    return { ok: false, code: "insecure_context" };
  }

  if (!isCallMediaGrantedSync("video")) {
    const perms = await queryCommunityMessengerMediaPermissions();
    if (perms.microphone === "denied" || perms.camera === "denied") {
      return { ok: false, code: "denied" };
    }
    return { ok: false, code: "gum_failed" };
  }

  try {
    await refreshPreferredCommunityMessengerDevicesFromEnumerate();
    return { ok: true };
  } catch {
    return { ok: false, code: "gum_failed" };
  }
}

/** 통화 프라임·Agora 트랙용 MediaStreamConstraints */
export function buildCommunityMessengerMediaStreamConstraints(
  kind: CommunityMessengerCallKind,
  opts?: { fullVideoPrime?: boolean }
): MediaStreamConstraints {
  const fullVideo = opts?.fullVideoPrime === true;
  const { audioDeviceId, videoDeviceId } = readPreferredCommunityMessengerDeviceIds();

  if (fullVideo) {
    return {
      audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true,
      video: videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true,
    };
  }

  if (kind === "video") {
    return {
      audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true,
      video: videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true,
    };
  }

  return {
    audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true,
    video: false,
  };
}

/** 설정 화면 「테스트」— 저장된 장치로 짧게 스트림을 열었다가 닫는다 */
export async function testCommunityMessengerMediaPipeline(): Promise<void> {
  const { acquirePrimedCommunityMessengerStream } = await import("@/lib/call/permission-manager");
  const stream = await acquirePrimedCommunityMessengerStream("video");
  stream.getTracks().forEach((t) => t.stop());
}
