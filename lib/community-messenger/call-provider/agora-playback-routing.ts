import AgoraRTC from "agora-rtc-sdk-ng";
import type { IRemoteAudioTrack } from "agora-rtc-sdk-ng";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { readPreferredSpeakerSinkId } from "@/lib/permissions/speaker-output-preference";

/** Agora 원격 재생 기본(100). Android 체감 볼륨은 네이티브 STREAM_VOICE_CALL 바닥이 담당. */
export const CALL_REMOTE_AUDIO_PLAYBACK_VOLUME_VIDEO = 100;
export const CALL_REMOTE_AUDIO_PLAYBACK_VOLUME_VOICE = 100;

export function configureRemoteCallAudioPlayback(
  track: IRemoteAudioTrack,
  callKind: CommunityMessengerCallKind
): void {
  try {
    const vol =
      callKind === "video"
        ? CALL_REMOTE_AUDIO_PLAYBACK_VOLUME_VIDEO
        : CALL_REMOTE_AUDIO_PLAYBACK_VOLUME_VOICE;
    track.setVolume(vol);
  } catch {
    /* SDK 미지원 */
  }
}

export async function playRemoteCallAudioTrack(
  track: IRemoteAudioTrack,
  callKind: CommunityMessengerCallKind
): Promise<void> {
  configureRemoteCallAudioPlayback(track, callKind);
  await track.play();
}

/**
 * Chrome/Edge 데스크톱 등에서 원격 오디오 재생 장치 전환(스피커 vs 이어폰·헤드셋 우선).
 * 미지원 브라우저는 조용히 무시.
 */
export async function applyAgoraRemoteSpeakerPreference(
  track: IRemoteAudioTrack | null | undefined,
  preferSpeaker: boolean
): Promise<void> {
  if (!track || typeof track.setPlaybackDevice !== "function") return;
  try {
    const devices = (await AgoraRTC.getPlaybackDevices()).filter((d) => d.deviceId);
    if (!devices.length) return;
    const lb = (d: { label?: string }) => (d.label ?? "").toLowerCase();
    if (preferSpeaker) {
      const saved = readPreferredSpeakerSinkId();
      if (saved && devices.some((d) => d.deviceId === saved)) {
        await track.setPlaybackDevice(saved);
        return;
      }
      const speakerLike = devices.find((d) => /speaker|스피커|扬声器|realtek|audio\(r\)/i.test(lb(d)));
      await track.setPlaybackDevice((speakerLike ?? devices[devices.length - 1]).deviceId);
      return;
    }
    const headLike = devices.find((d) =>
      /headphone|headset|earphone|이어|耳机|耳機|earbud|hands-free|handsfree/i.test(lb(d))
    );
    await track.setPlaybackDevice((headLike ?? devices[0]).deviceId);
  } catch {
    /* NOT_SUPPORTED (Safari 등) */
  }
}
