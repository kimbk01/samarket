"use client";

import AgoraRTC, {
  type IAgoraRTCClient,
  type ILocalAudioTrack,
  type ILocalVideoTrack,
} from "agora-rtc-sdk-ng";
import { consumePrimedCommunityMessengerDevicePermission } from "@/lib/community-messenger/call-permission";
import {
  readPreferredCommunityMessengerDeviceIds,
  writePreferredCommunityMessengerDeviceIds,
} from "@/lib/community-messenger/media-preflight";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

export type CommunityMessengerAgoraLocalTracks = {
  audioTrack: ILocalAudioTrack;
  videoTrack: ILocalVideoTrack | null;
};

export function createCommunityMessengerAgoraClient(): IAgoraRTCClient {
  return AgoraRTC.createClient({ codec: "vp8", mode: "rtc" });
}

async function createAgoraMicWithPreferredDevice(): Promise<ILocalAudioTrack> {
  const { audioDeviceId } = readPreferredCommunityMessengerDeviceIds();
  /** 음성 위주 인코딩을 먼저 시도(윈도우 등 일부 환경에서 music_standard 가 실패하는 경우 완화) */
  const encoderCandidates = ["speech_standard", "music_standard"] as const;

  for (const encoderConfig of encoderCandidates) {
    try {
      if (audioDeviceId) {
        return await AgoraRTC.createMicrophoneAudioTrack({
          encoderConfig,
          microphoneId: audioDeviceId,
        });
      }
      return await AgoraRTC.createMicrophoneAudioTrack({ encoderConfig });
    } catch {
      writePreferredCommunityMessengerDeviceIds(null, null);
      try {
        return await AgoraRTC.createMicrophoneAudioTrack({ encoderConfig });
      } catch {
        /* 다음 인코더 */
      }
    }
  }
  return AgoraRTC.createMicrophoneAudioTrack();
}

async function createAgoraCamWithPreferredDevice(): Promise<ILocalVideoTrack> {
  const { videoDeviceId } = readPreferredCommunityMessengerDeviceIds();
  const base = {
    encoderConfig: "720p_2" as const,
    optimizationMode: "motion" as const,
  };
  try {
    if (videoDeviceId) {
      return await AgoraRTC.createCameraVideoTrack({
        ...base,
        cameraId: videoDeviceId,
      });
    }
    return await AgoraRTC.createCameraVideoTrack(base);
  } catch {
    const cur = readPreferredCommunityMessengerDeviceIds();
    writePreferredCommunityMessengerDeviceIds(cur.audioDeviceId, null);
    return AgoraRTC.createCameraVideoTrack(base);
  }
}

export async function createCommunityMessengerAgoraLocalTracks(
  kind: CommunityMessengerCallKind
): Promise<CommunityMessengerAgoraLocalTracks> {
  const primed = consumePrimedCommunityMessengerDevicePermission(kind);
  if (primed) {
    const audioMedia = primed.getAudioTracks().find((t) => t.readyState === "live") ?? null;
    if (audioMedia) {
      const audioTrack = AgoraRTC.createCustomAudioTrack({
        mediaStreamTrack: audioMedia,
        encoderConfig: "speech_standard",
      });
      if (kind !== "video") {
        return { audioTrack, videoTrack: null };
      }
      const videoMedia = primed.getVideoTracks().find((t) => t.readyState === "live") ?? null;
      if (videoMedia) {
        try {
          const videoTrack = AgoraRTC.createCustomVideoTrack({
            mediaStreamTrack: videoMedia,
          });
          return { audioTrack, videoTrack };
        } catch (error) {
          await audioTrack.close();
          throw error;
        }
      }
      try {
        const videoTrack = await createAgoraCamWithPreferredDevice();
        return { audioTrack, videoTrack };
      } catch (error) {
        await audioTrack.close();
        throw error;
      }
    }
  }

  const audioTrack = await createAgoraMicWithPreferredDevice();
  if (kind !== "video") {
    return { audioTrack, videoTrack: null };
  }
  try {
    const videoTrack = await createAgoraCamWithPreferredDevice();
    return { audioTrack, videoTrack };
  } catch (error) {
    await audioTrack.close();
    throw error;
  }
}

export async function joinCommunityMessengerAgoraChannel(args: {
  client: IAgoraRTCClient;
  appId: string;
  channelName: string;
  token: string | null;
  uid: string;
}) {
  return args.client.join(args.appId, args.channelName, args.token, args.uid);
}

export async function publishCommunityMessengerAgoraTracks(args: {
  client: IAgoraRTCClient;
  tracks: CommunityMessengerAgoraLocalTracks;
}) {
  const tracks: Array<ILocalAudioTrack | ILocalVideoTrack> = args.tracks.videoTrack
    ? [args.tracks.audioTrack, args.tracks.videoTrack]
    : [args.tracks.audioTrack];
  await args.client.publish(tracks);
}

export async function closeCommunityMessengerAgoraTracks(tracks: CommunityMessengerAgoraLocalTracks | null) {
  if (!tracks) return;
  tracks.audioTrack.stop();
  tracks.audioTrack.close();
  if (tracks.videoTrack) {
    tracks.videoTrack.stop();
    tracks.videoTrack.close();
  }
}

/** 영상 통화에서 전후면·외장 캠 전환 시 사용 */
export async function listCommunityMessengerCameras(): Promise<MediaDeviceInfo[]> {
  return AgoraRTC.getCameras();
}
