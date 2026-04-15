/**
 * 단일 getUserMedia 게이트 + 커뮤니티 메신저 WebRTC 로컬 스트림 세션 캐시.
 * - 음성: audio 만 요청
 * - 영상: 기존 오디오 스트림이 있으면 video 트랙만 추가(업그레이드)
 * - Permissions API 로 denied 면 GUM 전에 차단
 */

import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import {
  buildCommunityMessengerMediaStreamConstraints,
  isCommunityMessengerMediaSecureContext,
  persistDeviceIdsFromMediaStream,
  queryCommunityMessengerMediaPermissions,
  readPreferredCommunityMessengerDeviceIds,
  refreshPreferredCommunityMessengerDevicesFromEnumerate,
} from "@/lib/community-messenger/media-preflight";

export type CallMediaPermissionErrorCode = "insecure_context" | "no_mediadevices" | "denied" | "failed";

export type CallMediaEnsureResult =
  | { ok: true }
  | { ok: false; code: CallMediaPermissionErrorCode; cause?: unknown };

type CacheEntry = {
  sessionKey: string;
  stream: MediaStream;
  /** 스트림이 audio-only 인지(영상 트랙 없음 또는 모두 ended) */
  audioOnly: boolean;
};

let sessionCache: CacheEntry | null = null;

const PENDING_SESSION_KEY = "__cm_pending__";

function streamHasLiveAudio(stream: MediaStream): boolean {
  return stream.getAudioTracks().some((t) => t.readyState === "live");
}

function streamHasLiveVideo(stream: MediaStream): boolean {
  return stream.getVideoTracks().some((t) => t.readyState === "live");
}

function stopAndClearCache(): void {
  if (!sessionCache) return;
  for (const t of sessionCache.stream.getTracks()) {
    try {
      t.stop();
    } catch {
      /* ignore */
    }
  }
  sessionCache = null;
}

async function invokeGetUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new DOMException("getUserMedia unavailable", "NotSupportedError");
  }
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  persistDeviceIdsFromMediaStream(stream);
  void refreshPreferredCommunityMessengerDevicesFromEnumerate();
  return stream;
}

/** Permissions API 가능 시 mic/camera 상태 조회(Safari 등 null 가능) */
export async function queryMicrophoneCameraPermissionState(): Promise<{
  microphone: PermissionState | null;
  camera: PermissionState | null;
}> {
  return queryCommunityMessengerMediaPermissions();
}

/**
 * 지속적으로 거부된 권한이면 GUM 없이 NotAllowedError 로 정렬.
 * (프라임 제스처 직전·acquire 직전에 호출)
 */
export async function assertCallMediaNotPersistentlyDenied(kind: CommunityMessengerCallKind): Promise<void> {
  const perms = await queryCommunityMessengerMediaPermissions();
  if (perms.microphone === "denied") {
    throw new DOMException("Microphone permission denied", "NotAllowedError");
  }
  if (kind === "video" && perms.camera === "denied") {
    throw new DOMException("Camera permission denied", "NotAllowedError");
  }
}

export async function ensureAudioPermission(): Promise<CallMediaEnsureResult> {
  if (!isCommunityMessengerMediaSecureContext()) return { ok: false, code: "insecure_context" };
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { ok: false, code: "no_mediadevices" };
  }
  const perms = await queryCommunityMessengerMediaPermissions();
  if (perms.microphone === "denied") return { ok: false, code: "denied" };
  return { ok: true };
}

export async function ensureVideoPermission(): Promise<CallMediaEnsureResult> {
  if (!isCommunityMessengerMediaSecureContext()) return { ok: false, code: "insecure_context" };
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { ok: false, code: "no_mediadevices" };
  }
  const perms = await queryCommunityMessengerMediaPermissions();
  if (perms.microphone === "denied" || perms.camera === "denied") return { ok: false, code: "denied" };
  return { ok: true };
}

export async function ensureCallPermission(mode: "audio" | "video"): Promise<CallMediaEnsureResult> {
  return mode === "video" ? ensureVideoPermission() : ensureAudioPermission();
}

function normalizeSessionKey(sessionKey: string | null | undefined): string {
  if (sessionKey && sessionKey.trim()) return sessionKey.trim();
  return PENDING_SESSION_KEY;
}

/**
 * 발신 프라임 전용: 세션 캐시를 오염시키지 않고 한 번 GUM(항상 제스처 스택에서 호출).
 */
export async function acquirePrimedCommunityMessengerStream(kind: CommunityMessengerCallKind): Promise<MediaStream> {
  if (!isCommunityMessengerMediaSecureContext()) {
    throw new DOMException("insecure context", "NotAllowedError");
  }
  await assertCallMediaNotPersistentlyDenied(kind);
  return invokeGetUserMedia(buildCommunityMessengerMediaStreamConstraints(kind));
}

/** Agora 마이크 생성 실패 시 마지막 수단 — audio-only, 세션 캐시와 분리 */
export async function createFallbackAudioOnlyMediaStream(): Promise<MediaStream> {
  if (!isCommunityMessengerMediaSecureContext()) {
    throw new DOMException("insecure context", "NotAllowedError");
  }
  const perms = await queryCommunityMessengerMediaPermissions();
  if (perms.microphone === "denied") {
    throw new DOMException("Microphone permission denied", "NotAllowedError");
  }
  return invokeGetUserMedia({ audio: true, video: false });
}

/**
 * 활성 통화 세션용: 같은 sessionKey 에서 스트림 재사용·음성→영상은 트랙 추가.
 */
export async function acquireCommunityMessengerWebRtcStream(
  kind: CommunityMessengerCallKind,
  options?: { sessionKey?: string | null }
): Promise<MediaStream> {
  if (!isCommunityMessengerMediaSecureContext()) {
    throw new DOMException("insecure context", "NotAllowedError");
  }
  await assertCallMediaNotPersistentlyDenied(kind);
  const key = normalizeSessionKey(options?.sessionKey ?? null);

  if (sessionCache && sessionCache.sessionKey !== key) {
    stopAndClearCache();
  }

  if (sessionCache && sessionCache.stream) {
    const s = sessionCache.stream;
    const liveA = streamHasLiveAudio(s);
    const liveV = streamHasLiveVideo(s);

    if (kind === "voice" && liveA) {
      return s;
    }

    if (kind === "video" && liveA && liveV) {
      return s;
    }

    if (kind === "video" && liveA && !liveV) {
      const { videoDeviceId } = readPreferredCommunityMessengerDeviceIds();
      const videoConstraints = videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true;
      const vidStream = await invokeGetUserMedia({ audio: false, video: videoConstraints });
      const vt = vidStream.getVideoTracks()[0];
      if (!vt) {
        for (const t of vidStream.getTracks()) t.stop();
        throw new DOMException("No video track", "NotFoundError");
      }
      s.addTrack(vt);
      sessionCache = { sessionKey: key, stream: s, audioOnly: false };
      return s;
    }
  }

  stopAndClearCache();
  const stream = await invokeGetUserMedia(buildCommunityMessengerMediaStreamConstraints(kind));
  sessionCache = {
    sessionKey: key,
    stream,
    audioOnly: kind === "voice" || !streamHasLiveVideo(stream),
  };
  return stream;
}

/** 프라임 consume 후 실제 세션 id 가 정해지면 캐시 키만 옮김(스트림 유지) */
export function migrateCommunityMessengerMediaSessionKey(fromKey: string | null | undefined, toKey: string | null | undefined): void {
  const fromN = normalizeSessionKey(fromKey);
  const toN = normalizeSessionKey(toKey);
  if (fromN === toN) return;
  if (sessionCache && sessionCache.sessionKey === fromN) {
    sessionCache = { ...sessionCache, sessionKey: toN };
  }
}

/**
 * 외부에서 이미 확보한 스트림(프라임 consume)을 세션 캐시에 등록.
 */
export function adoptCommunityMessengerWebRtcStream(
  sessionKey: string | null | undefined,
  stream: MediaStream,
  kind: CommunityMessengerCallKind
): void {
  const key = normalizeSessionKey(sessionKey);
  stopAndClearCache();
  sessionCache = {
    sessionKey: key,
    stream,
    audioOnly: kind === "voice" || !streamHasLiveVideo(stream),
  };
}

/** 통화 종료·미디어 정리 시 */
export function releaseCommunityMessengerWebRtcMedia(): void {
  stopAndClearCache();
}

/** 업그레이드 롤백 등으로 스트림에서 비디오 트랙만 제거한 뒤 캐시 메타 동기화 */
export function syncCommunityMessengerWebRtcSessionCacheAfterTracksChanged(sessionKey: string | null | undefined): void {
  const key = normalizeSessionKey(sessionKey);
  if (!sessionCache || sessionCache.sessionKey !== key) return;
  sessionCache = {
    ...sessionCache,
    audioOnly: !streamHasLiveVideo(sessionCache.stream),
  };
}
