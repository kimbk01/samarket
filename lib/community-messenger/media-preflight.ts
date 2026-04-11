import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

const LS_AUDIO = "cm_messenger_preferred_audio_input_id";
const LS_VIDEO = "cm_messenger_preferred_video_input_id";

export type CommunityMessengerMediaPermissionSnapshot = {
  microphone: PermissionState | null;
  camera: PermissionState | null;
};

/** localhost·127.0.0.1 은 예외, 그 외 비 HTTPS 는 getUserMedia 불가 */
export function isCommunityMessengerMediaSecureContext(): boolean {
  if (typeof window === "undefined") return true;
  if (window.isSecureContext) return true;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
}

export async function queryCommunityMessengerMediaPermissions(): Promise<CommunityMessengerMediaPermissionSnapshot> {
  const out: CommunityMessengerMediaPermissionSnapshot = { microphone: null, camera: null };
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return out;
  try {
    const mic = await navigator.permissions.query({ name: "microphone" as PermissionName });
    out.microphone = mic.state;
  } catch {
    /* Safari 등 미지원 */
  }
  try {
    const cam = await navigator.permissions.query({ name: "camera" as PermissionName });
    out.camera = cam.state;
  } catch {
    /* Safari 등 미지원 */
  }
  return out;
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

function persistDeviceIdsFromMediaStream(stream: MediaStream): void {
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

/**
 * 메신저 진입 시 1회: 마이크+카메라 동시 요청으로 권한·장치 ID 확보.
 * 카메라 거부 시 음성만으로 폴백한다.
 */
export async function runCommunityMessengerEntryMediaPreflight(): Promise<CommunityMessengerPreflightResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { ok: false, code: "no_mediadevices" };
  }
  if (!isCommunityMessengerMediaSecureContext()) {
    return { ok: false, code: "insecure_context" };
  }

  const perms = await queryCommunityMessengerMediaPermissions();
  if (perms.microphone === "denied") {
    return { ok: false, code: "denied" };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    persistDeviceIdsFromMediaStream(stream);
    stream.getTracks().forEach((t) => t.stop());
    await refreshPreferredCommunityMessengerDevicesFromEnumerate();
    return { ok: true };
  } catch {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      persistDeviceIdsFromMediaStream(stream);
      stream.getTracks().forEach((t) => t.stop());
      await refreshPreferredCommunityMessengerDevicesFromEnumerate();
      return { ok: true };
    } catch {
      return { ok: false, code: "gum_failed" };
    }
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
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("no_mediadevices");
  }
  const stream = await navigator.mediaDevices.getUserMedia(
    buildCommunityMessengerMediaStreamConstraints("video")
  );
  stream.getTracks().forEach((t) => t.stop());
}
