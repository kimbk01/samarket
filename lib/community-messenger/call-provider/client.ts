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

const AGORA_MIC_ENCODER_CANDIDATES = ["speech_standard", "music_standard"] as const;

async function tryCreateAgoraMicTrack(microphoneId?: string): Promise<ILocalAudioTrack | null> {
  for (const encoderConfig of AGORA_MIC_ENCODER_CANDIDATES) {
    try {
      if (microphoneId) {
        return await AgoraRTC.createMicrophoneAudioTrack({ encoderConfig, microphoneId });
      }
      return await AgoraRTC.createMicrophoneAudioTrack({ encoderConfig });
    } catch {
      /* 다음 인코더 */
    }
  }
  try {
    if (microphoneId) {
      return await AgoraRTC.createMicrophoneAudioTrack({ microphoneId });
    }
    return await AgoraRTC.createMicrophoneAudioTrack();
  } catch {
    return null;
  }
}

async function createAgoraMicWithPreferredDevice(): Promise<ILocalAudioTrack> {
  let { audioDeviceId } = readPreferredCommunityMessengerDeviceIds();

  if (audioDeviceId) {
    const t = await tryCreateAgoraMicTrack(audioDeviceId);
    if (t) return t;
    const cur = readPreferredCommunityMessengerDeviceIds();
    writePreferredCommunityMessengerDeviceIds(null, cur.videoDeviceId);
    audioDeviceId = null;
  }

  const defaultMic = await tryCreateAgoraMicTrack(undefined);
  if (defaultMic) return defaultMic;

  if (typeof navigator !== "undefined" && navigator.mediaDevices?.enumerateDevices) {
    let list: MediaDeviceInfo[] = [];
    try {
      list = await navigator.mediaDevices.enumerateDevices();
    } catch {
      /* */
    }
    const inputs = list.filter((d) => d.kind === "audioinput" && d.deviceId);
    for (const d of inputs) {
      const t = await tryCreateAgoraMicTrack(d.deviceId);
      if (t) return t;
    }
  }

  if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = stream.getAudioTracks().find((tr) => tr.readyState === "live") ?? stream.getAudioTracks()[0];
      if (media) {
        return AgoraRTC.createCustomAudioTrack({
          mediaStreamTrack: media,
          encoderConfig: "speech_standard",
        });
      }
    } catch {
      /* 아래 최종 throw */
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
