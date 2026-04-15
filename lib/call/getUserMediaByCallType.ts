import type { MessengerCallKind } from "@/lib/community-messenger/stores/useCallStore";
import { acquirePrimedCommunityMessengerStream } from "@/lib/call/permission-manager";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

export type UserMediaBundle = {
  stream: MediaStream;
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
};

function toCommunityKind(kind: MessengerCallKind): CommunityMessengerCallKind {
  return kind === "video" ? "video" : "voice";
}

/**
 * 브라우저 네이티브 MediaStream — `permission-manager` 단일 경로(음성은 audio-only).
 * 권한은 호출 전 사용자 제스처에서 확보하는 것을 권장 (`call-permission` 프라임).
 */
export async function getUserMediaByCallType(kind: MessengerCallKind): Promise<UserMediaBundle> {
  const stream = await acquirePrimedCommunityMessengerStream(toCommunityKind(kind));
  const videoTrack = stream.getVideoTracks()[0] ?? null;
  const audioTrack = stream.getAudioTracks()[0] ?? null;
  return { stream, videoTrack, audioTrack };
}

export function stopUserMediaBundle(bundle: UserMediaBundle | null): void {
  if (!bundle) return;
  for (const t of bundle.stream.getTracks()) t.stop();
}
