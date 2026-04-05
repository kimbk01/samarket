"use client";

import AgoraRTC, {
  type IAgoraRTCClient,
  type ILocalAudioTrack,
  type ILocalVideoTrack,
} from "agora-rtc-sdk-ng";
import { consumePrimedCommunityMessengerDevicePermission } from "@/lib/community-messenger/call-permission";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

export type CommunityMessengerAgoraLocalTracks = {
  audioTrack: ILocalAudioTrack;
  videoTrack: ILocalVideoTrack | null;
};

export function createCommunityMessengerAgoraClient(): IAgoraRTCClient {
  return AgoraRTC.createClient({ codec: "vp8", mode: "rtc" });
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
        encoderConfig: "music_standard",
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
        const videoTrack = await AgoraRTC.createCameraVideoTrack({
          encoderConfig: "720p_2",
          optimizationMode: "motion",
        });
        return { audioTrack, videoTrack };
      } catch (error) {
        await audioTrack.close();
        throw error;
      }
    }
  }

  const audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
    encoderConfig: "music_standard",
  });
  if (kind !== "video") {
    return { audioTrack, videoTrack: null };
  }
  try {
    const videoTrack = await AgoraRTC.createCameraVideoTrack({
      encoderConfig: "720p_2",
      optimizationMode: "motion",
    });
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
