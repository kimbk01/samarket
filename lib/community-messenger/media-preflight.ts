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
  /**
   * false(기본): Permissions API 상 `prompt` 이거나 미지원(null)일 때 **시스템 권한 창을 띄우지 않음**
   * (카카오·라인처럼 메인 진입만으로 마이크/카메라를 반복 요청하지 않음).
   * true: 첫 탭·클릭 등 **사용자 제스처 이후** 재시도할 때만 GUM 시도.
   */
  allowPermissionPrompt?: boolean;
};

/**
 * 메신저 진입 시: 이미 허용된 권한이면 조용히 장치 ID만 확보.
 * 아직 결정 전(`prompt`)이면 **호출부가 allowPermissionPrompt: true 인 경우에만** GUM(라인/카카오톡과 같이 첫 의도 시 한 번).
 */
export async function runCommunityMessengerEntryMediaPreflight(
  opts?: CommunityMessengerEntryMediaPreflightOptions
): Promise<CommunityMessengerPreflightResult> {
  const allowPrompt = opts?.allowPermissionPrompt === true;
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

  const micUnset = perms.microphone == null;
  const camUnset = perms.camera == null;
  const micPrompt = perms.microphone === "prompt";
  const needGesturePath = micPrompt || (micUnset && camUnset);

  if (needGesturePath && !allowPrompt) {
    return { ok: false, code: "gum_failed" };
  }

  const tryAcquire = async (): Promise<boolean> => {
    try {
      /** 메신저 진입 프리플라이트는 마이크만(영상 통화도 별도 사용자 의도 시 카메라 요청). */
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      persistDeviceIdsFromMediaStream(stream);
      stream.getTracks().forEach((t) => t.stop());
      await refreshPreferredCommunityMessengerDevicesFromEnumerate();
      return true;
    } catch {
      return false;
    }
  };

  if (perms.microphone === "granted" || (allowPrompt && perms.microphone === "prompt")) {
    if (await tryAcquire()) return { ok: true };
    return { ok: false, code: "gum_failed" };
  }

  /** Safari 등: microphone 만 null 이고 이미 스트림이 열린 적 있으면 granted 와 유사하게 시도 */
  if (allowPrompt && micUnset && !camUnset) {
    if (await tryAcquire()) return { ok: true };
    return { ok: false, code: "gum_failed" };
  }

  if (allowPrompt) {
    if (await tryAcquire()) return { ok: true };
    return { ok: false, code: "gum_failed" };
  }

  return { ok: false, code: "gum_failed" };
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
