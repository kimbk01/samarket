"use client";

import AgoraRTC, {
  type IAgoraRTCClient,
  type ICameraVideoTrack,
  type ILocalVideoTrack,
} from "agora-rtc-sdk-ng";
import { listCommunityMessengerCameras } from "@/lib/community-messenger/call-provider/client";
import {
  readPreferredCommunityMessengerDeviceIds,
  writePreferredCommunityMessengerDeviceIds,
} from "@/lib/community-messenger/media-preflight";

const CAMERA_TRACK_BASE = {
  encoderConfig: "480p_2" as const,
  optimizationMode: "motion" as const,
};

export function isCommunityMessengerCameraVideoTrack(
  track: ILocalVideoTrack | null
): track is ICameraVideoTrack {
  return !!track && typeof (track as ICameraVideoTrack).setDevice === "function";
}

export function isCommunityMessengerCameraSwitchSupported(track: ILocalVideoTrack | null): boolean {
  return !!track;
}

function clearPinnedVideoDeviceId(): void {
  const { audioDeviceId } = readPreferredCommunityMessengerDeviceIds();
  writePreferredCommunityMessengerDeviceIds(audioDeviceId, null);
}

function persistVideoDeviceFromTrack(track: ILocalVideoTrack): void {
  try {
    const deviceId = track.getMediaStreamTrack().getSettings().deviceId;
    if (!deviceId) return;
    const { audioDeviceId } = readPreferredCommunityMessengerDeviceIds();
    writePreferredCommunityMessengerDeviceIds(audioDeviceId, deviceId);
  } catch {
    /* ignore */
  }
}

export async function switchCommunityMessengerCameraFacing(args: {
  videoTrack: ILocalVideoTrack;
  useRearFacingRef: { current: boolean };
  client?: IAgoraRTCClient | null;
  onReplacedVideoTrack?: (next: ILocalVideoTrack) => void;
  onAfterSwitch?: () => void | Promise<void>;
}): Promise<ILocalVideoTrack> {
  const { videoTrack, useRearFacingRef, client, onReplacedVideoTrack, onAfterSwitch } = args;

  if (isCommunityMessengerCameraVideoTrack(videoTrack)) {
    useRearFacingRef.current = !useRearFacingRef.current;
    clearPinnedVideoDeviceId();
    try {
      await videoTrack.setDevice({
        facingMode: useRearFacingRef.current ? "environment" : "user",
      });
      persistVideoDeviceFromTrack(videoTrack);
    } catch {
      useRearFacingRef.current = !useRearFacingRef.current;
      try {
        const list = await listCommunityMessengerCameras();
        if (list.length < 2) return videoTrack;
        const cur = videoTrack.getMediaStreamTrack().getSettings().deviceId;
        const next = list.find((d) => d.deviceId !== cur) ?? list[1];
        await videoTrack.setDevice(next.deviceId);
        useRearFacingRef.current = false;
        persistVideoDeviceFromTrack(videoTrack);
      } catch {
        /* ignore */
      }
    }
    await onAfterSwitch?.();
    return videoTrack;
  }

  useRearFacingRef.current = !useRearFacingRef.current;
  const facingMode = useRearFacingRef.current ? "environment" : "user";
  clearPinnedVideoDeviceId();
  let nextTrack: ILocalVideoTrack;
  try {
    nextTrack = await AgoraRTC.createCameraVideoTrack({
      ...CAMERA_TRACK_BASE,
      facingMode,
    });
  } catch {
    useRearFacingRef.current = !useRearFacingRef.current;
    return videoTrack;
  }

  if (client) {
    try {
      await client.unpublish([videoTrack]);
    } catch {
      /* already unpublished */
    }
    try {
      await client.publish([nextTrack]);
    } catch {
      useRearFacingRef.current = !useRearFacingRef.current;
      try {
        nextTrack.stop();
        nextTrack.close();
      } catch {
        /* ignore */
      }
      try {
        await client.publish([videoTrack]);
      } catch {
        /* ignore */
      }
      return videoTrack;
    }
  }

  try {
    videoTrack.stop();
    videoTrack.close();
  } catch {
    /* ignore */
  }
  persistVideoDeviceFromTrack(nextTrack);
  onReplacedVideoTrack?.(nextTrack);
  await onAfterSwitch?.();
  return nextTrack;
}
