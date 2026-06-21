"use client";

import AgoraRTC, {
  type IAgoraRTCClient,
  type ILocalAudioTrack,
  type ILocalVideoTrack,
  type IRemoteAudioTrack,
  type IRemoteVideoTrack,
} from "agora-rtc-sdk-ng";
import { createFallbackAudioOnlyMediaStream } from "@/lib/call/permission-manager";
import {
  consumePrimedCommunityMessengerDevicePermission,
} from "@/lib/community-messenger/call-permission";
import {
  readPreferredCommunityMessengerDeviceIds,
  writePreferredCommunityMessengerDeviceIds,
} from "@/lib/community-messenger/media-preflight";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { assertCommunityMessengerWebRtcSecureContext } from "@/lib/community-messenger/media-errors";
import { ensureCallCanUseMedia } from "@/lib/community-messenger/call-media-permission-preflight";
import { applyAgoraRemoteSpeakerPreference, playRemoteCallAudioTrack } from "@/lib/community-messenger/call-provider/agora-playback-routing";

export { playRemoteCallAudioTrack };
import {
  closePrimedWebAudioCallToneContext,
  getPrimedWebAudioCallToneContextState,
} from "@/lib/community-messenger/call-tone-web-audio";
import { getSharedNotificationAudioContextState } from "@/lib/notifications/play-notification-sound";

export type CommunityMessengerAgoraLocalTracks = {
  audioTrack: ILocalAudioTrack;
  videoTrack: ILocalVideoTrack | null;
};

export function createCommunityMessengerAgoraClient(): IAgoraRTCClient {
  assertCommunityMessengerWebRtcSecureContext();
  return AgoraRTC.createClient({ codec: "vp8", mode: "rtc" });
}

const AGORA_MIC_ENCODER_CANDIDATES = ["speech_standard", "music_standard"] as const;

const MIC_3A = { AEC: true, ANS: true, AGC: true } as const;

async function tryCreateAgoraMicTrack(microphoneId?: string): Promise<ILocalAudioTrack | null> {
  for (const encoderConfig of AGORA_MIC_ENCODER_CANDIDATES) {
    try {
      if (microphoneId) {
        return await AgoraRTC.createMicrophoneAudioTrack({ encoderConfig, microphoneId, ...MIC_3A });
      }
      return await AgoraRTC.createMicrophoneAudioTrack({ encoderConfig, ...MIC_3A });
    } catch {
      /* 다음 인코더 */
    }
  }
  try {
    if (microphoneId) {
      return await AgoraRTC.createMicrophoneAudioTrack({ microphoneId, ...MIC_3A });
    }
    return await AgoraRTC.createMicrophoneAudioTrack({ ...MIC_3A });
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

  try {
    const stream = await createFallbackAudioOnlyMediaStream();
    const media = stream.getAudioTracks().find((tr) => tr.readyState === "live") ?? stream.getAudioTracks()[0];
    if (media) {
      return AgoraRTC.createCustomAudioTrack({
        mediaStreamTrack: media,
        encoderConfig: "speech_standard",
        ...MIC_3A,
      });
    }
  } catch {
    /* 아래 최종 throw */
  }

  return AgoraRTC.createMicrophoneAudioTrack();
}

/** Agora 조인 직전 — localStorage exact videoDeviceId 가 facingMode 전환을 막지 않게 핀 해제 */
async function createAgoraCamForMessengerJoin(): Promise<ILocalVideoTrack> {
  const { audioDeviceId } = readPreferredCommunityMessengerDeviceIds();
  writePreferredCommunityMessengerDeviceIds(audioDeviceId, null);
  return createAgoraCamWithPreferredDevice();
}

async function createAgoraCamWithPreferredDevice(): Promise<ILocalVideoTrack> {
  const { videoDeviceId } = readPreferredCommunityMessengerDeviceIds();
  /* 720p + 원격·로컬 동시 디코드는 저사양/모바일 웹에서 프레임 드랍 유발 → 480p 기본 */
  const base = {
    encoderConfig: "480p_2" as const,
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

function stopMediaStreamVideoTracks(stream: MediaStream): void {
  for (const track of stream.getVideoTracks()) {
    try {
      track.stop();
    } catch {
      /* already stopped */
    }
  }
}

/** primed/trusted GUM 오디오는 custom · 비디오는 CameraVideoTrack(setDevice 전환 지원) */
async function agoraLocalTracksFromMediaStream(
  stream: MediaStream,
  kind: CommunityMessengerCallKind
): Promise<CommunityMessengerAgoraLocalTracks> {
  const audioMedia = stream.getAudioTracks().find((t) => t.readyState === "live") ?? null;
  if (!audioMedia) {
    throw new DOMException("No audio track", "NotFoundError");
  }
  const audioTrack = AgoraRTC.createCustomAudioTrack({
    mediaStreamTrack: audioMedia,
    encoderConfig: "speech_standard",
    ...MIC_3A,
  });
  if (kind !== "video") {
    return { audioTrack, videoTrack: null };
  }
  const videoMedia = stream.getVideoTracks().find((t) => t.readyState === "live") ?? null;
  if (!videoMedia) {
    throw new DOMException("No video track", "NotFoundError");
  }
  stopMediaStreamVideoTracks(stream);
  try {
    const videoTrack = await createAgoraCamForMessengerJoin();
    return { audioTrack, videoTrack };
  } catch (error) {
    await audioTrack.close();
    throw error;
  }
}

async function createCommunityMessengerAgoraLocalTracksFromTrustedGum(
  _kind: CommunityMessengerCallKind
): Promise<CommunityMessengerAgoraLocalTracks | null> {
  /** 통화 중 GUM 금지 — Agora SDK 트랙 생성만 사용 */
  return null;
}

export async function createCommunityMessengerAgoraLocalTracks(
  kind: CommunityMessengerCallKind
): Promise<CommunityMessengerAgoraLocalTracks> {
  assertCommunityMessengerWebRtcSecureContext();
  const preflight = await ensureCallCanUseMedia(kind);
  if (!preflight.ok) {
    throw new DOMException("Microphone permission denied", "NotAllowedError");
  }
  const primed = consumePrimedCommunityMessengerDevicePermission(kind);
  if (primed && kind === "video") {
    /**
     * HTML 링 미리보기용 GUM 은 Agora 마이크로 재사용하지 않는다.
     * tmp→real 교체·DOM 부착 후 일부 삼성에서 audio track 이 live 여도 송신 무음이 될 수 있다.
     */
    try {
      primed.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
  } else if (primed) {
    const audioMedia = primed.getAudioTracks().find((t) => t.readyState === "live") ?? null;
    if (audioMedia) {
      const audioTrack = AgoraRTC.createCustomAudioTrack({
        mediaStreamTrack: audioMedia,
        encoderConfig: "speech_standard",
        ...MIC_3A,
      });
      return { audioTrack, videoTrack: null };
    }
    try {
      primed.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
  }

  const trustedGum = await createCommunityMessengerAgoraLocalTracksFromTrustedGum(kind);
  if (trustedGum) {
    return trustedGum;
  }

  if (kind !== "video") {
    const audioTrack = await createAgoraMicWithPreferredDevice();
    return { audioTrack, videoTrack: null };
  }

  const audioPromise = createAgoraMicWithPreferredDevice();
  const videoPromise = createAgoraCamWithPreferredDevice();
  try {
    const [audioTrack, videoTrack] = await Promise.all([audioPromise, videoPromise]);
    return { audioTrack, videoTrack };
  } catch (error) {
    try {
      const audioTrack = await audioPromise.catch(() => null);
      if (audioTrack) await audioTrack.close();
    } catch {
      /* ignore */
    }
    try {
      const videoTrack = await videoPromise.catch(() => null);
      if (videoTrack) {
        videoTrack.stop();
        videoTrack.close();
      }
    } catch {
      /* ignore */
    }
    throw error;
  }
}

export async function createCommunityMessengerAgoraLocalAudioTrackOnly(): Promise<ILocalAudioTrack> {
  assertCommunityMessengerWebRtcSecureContext();
  const preflight = await ensureCallCanUseMedia("voice");
  if (!preflight.ok) {
    throw new DOMException("Microphone permission denied", "NotAllowedError");
  }
  return createAgoraMicWithPreferredDevice();
}

/** 조인 직전 — 카메라만 열고 마이크는 라우트 확정 후 별도 생성 (에코 방지). */
export async function createCommunityMessengerAgoraLocalVideoTrackForJoin(): Promise<ILocalVideoTrack> {
  return createCommunityMessengerAgoraVideoTrackOnly();
}

/** Voice call in progress: add camera track only (keep existing mic publish). */
export async function createCommunityMessengerAgoraVideoTrackOnly(): Promise<ILocalVideoTrack> {
  assertCommunityMessengerWebRtcSecureContext();
  const preflight = await ensureCallCanUseMedia("video");
  if (!preflight.ok) {
    throw new DOMException("Camera permission denied", "NotAllowedError");
  }
  return createAgoraCamWithPreferredDevice();
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
  try {
    tracks.audioTrack.stop();
  } catch {
    /* already stopped */
  }
  try {
    tracks.audioTrack.close();
  } catch {
    /* idempotent */
  }
  if (tracks.videoTrack) {
    try {
      tracks.videoTrack.stop();
    } catch {
      /* */
    }
    try {
      tracks.videoTrack.close();
    } catch {
      /* */
    }
  }
}

export type CommunityMessengerAgoraCleanupStats = {
  localAudioClosed: boolean;
  localVideoClosed: boolean;
  remoteTrackCount: number;
  mediaElementCount: number;
  audioContextState: string;
  speakerRestored: boolean;
};

/**
 * 1:1 Agora 통화 자원을 한 경로로 정리 (순서 고정 — 마이크/BT 통화 모드·미디어 요소 잔류 해제).
 * PATCH 여부와 무관하게 동일 호출. 중복 호출: SDK 가 이미 내려간 경우 catch 로 무시.
 */
export async function cleanupCommunityMessengerAgoraCallResources(input: {
  client: IAgoraRTCClient | null;
  tracks: CommunityMessengerAgoraLocalTracks | null;
  remoteAudioTrack?: IRemoteAudioTrack | null;
  remoteVideoTrack?: IRemoteVideoTrack | null;
}): Promise<CommunityMessengerAgoraCleanupStats> {
  const { client, tracks } = input;
  const remoteAudioTrack = input.remoteAudioTrack ?? null;
  const remoteVideoTrack = input.remoteVideoTrack ?? null;

  const remoteTrackCount =
    (remoteAudioTrack ? 1 : 0) + (remoteVideoTrack ? 1 : 0);

  let mediaElementCount = 0;
  if (typeof document !== "undefined") {
    try {
      mediaElementCount = document.querySelectorAll("audio, video").length;
    } catch {
      mediaElementCount = 0;
    }
  }

  let localAudioClosed = !tracks?.audioTrack;
  let localVideoClosed = !tracks?.videoTrack;
  let speakerRestored = !remoteAudioTrack;

  if (tracks?.audioTrack) {
    try {
      await tracks.audioTrack.setEnabled(false);
    } catch {
      /* */
    }
  }
  if (tracks?.videoTrack) {
    try {
      await tracks.videoTrack.setEnabled(false);
    } catch {
      /* */
    }
  }

  if (client) {
    try {
      if (tracks && (tracks.audioTrack || tracks.videoTrack)) {
        const pub: Array<ILocalAudioTrack | ILocalVideoTrack> = [];
        if (tracks.audioTrack) pub.push(tracks.audioTrack);
        if (tracks.videoTrack) pub.push(tracks.videoTrack);
        if (pub.length > 0) {
          await client.unpublish(pub);
        }
      } else {
        await client.unpublish();
      }
    } catch {
      /* already unpublished / not joined */
    }
  }

  if (tracks?.audioTrack) {
    try {
      tracks.audioTrack.stop();
    } catch {
      /* */
    }
    try {
      await tracks.audioTrack.close();
      localAudioClosed = true;
    } catch {
      localAudioClosed = false;
    }
  }
  if (tracks?.videoTrack) {
    try {
      tracks.videoTrack.stop();
    } catch {
      /* */
    }
    try {
      await tracks.videoTrack.close();
      localVideoClosed = true;
    } catch {
      localVideoClosed = false;
    }
  }

  if (remoteAudioTrack) {
    try {
      /** 스피커 출력으로 고정된 재생 장치를 통화 종료 직전 되돌림 — BT/통화 세션 잔류 완화 */
      await applyAgoraRemoteSpeakerPreference(remoteAudioTrack, false);
      speakerRestored = true;
    } catch {
      speakerRestored = false;
    }
    try {
      remoteAudioTrack.stop();
    } catch {
      /* */
    }
  }
  if (remoteVideoTrack) {
    try {
      remoteVideoTrack.stop();
    } catch {
      /* */
    }
  }

  if (typeof document !== "undefined") {
    try {
      document.querySelectorAll("audio").forEach((el) => {
        const a = el as HTMLAudioElement;
        try {
          a.pause();
        } catch {
          /* */
        }
        try {
          a.srcObject = null;
        } catch {
          /* */
        }
        try {
          a.removeAttribute("src");
        } catch {
          /* */
        }
        try {
          a.load();
        } catch {
          /* */
        }
      });
      document.querySelectorAll("video").forEach((el) => {
        const v = el as HTMLVideoElement;
        try {
          v.pause();
        } catch {
          /* */
        }
        try {
          v.srcObject = null;
        } catch {
          /* */
        }
        try {
          v.removeAttribute("src");
        } catch {
          /* */
        }
        try {
          v.load();
        } catch {
          /* */
        }
      });
    } catch {
      /* */
    }
  }

  closePrimedWebAudioCallToneContext();

  if (client) {
    try {
      await client.leave();
    } catch {
      /* */
    }
    try {
      client.removeAllListeners();
    } catch {
      /* */
    }
  }

  const audioContextState = [
    `tone:${getPrimedWebAudioCallToneContextState()}`,
    `notify:${getSharedNotificationAudioContextState() ?? "none"}`,
  ].join("|");

  return {
    localAudioClosed,
    localVideoClosed,
    remoteTrackCount,
    mediaElementCount,
    audioContextState,
    speakerRestored,
  };
}

/** 영상 통화에서 전후면·외장 캠 전환 시 사용 */
export async function listCommunityMessengerCameras(): Promise<MediaDeviceInfo[]> {
  assertCommunityMessengerWebRtcSecureContext();
  return AgoraRTC.getCameras();
}
