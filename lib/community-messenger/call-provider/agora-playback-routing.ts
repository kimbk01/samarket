import AgoraRTC from "agora-rtc-sdk-ng";
import type { IRemoteAudioTrack } from "agora-rtc-sdk-ng";

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
