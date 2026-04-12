import type { MessengerCallKind } from "@/lib/community-messenger/stores/useCallStore";

export type UserMediaBundle = {
  stream: MediaStream;
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
};

/**
 * 브라우저 네이티브 getUserMedia — Agora 트랙과 별개로 WebRTC RTCPeerConnection 에 직접 꽂을 때 사용.
 * 권한은 호출 전 사용자 제스처에서 확보하는 것을 권장 (`call-permission` 프라임).
 */
export async function getUserMediaByCallType(kind: MessengerCallKind): Promise<UserMediaBundle> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("getUserMedia_unavailable");
  }
  const constraints: MediaStreamConstraints =
    kind === "video"
      ? { audio: true, video: { facingMode: "user" } }
      : { audio: true, video: false };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const videoTrack = stream.getVideoTracks()[0] ?? null;
  const audioTrack = stream.getAudioTracks()[0] ?? null;
  return { stream, videoTrack, audioTrack };
}

export function stopUserMediaBundle(bundle: UserMediaBundle | null): void {
  if (!bundle) return;
  for (const t of bundle.stream.getTracks()) t.stop();
}
