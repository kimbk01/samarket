"use client";

import type { IAgoraRTCClient, IAgoraRTCRemoteUser, ILocalVideoTrack, IRemoteVideoTrack } from "agora-rtc-sdk-ng";
import {
  isCommunityMessengerCameraSwitchSupported,
  switchCommunityMessengerCameraFacing,
} from "@/lib/community-messenger/call-camera-switch";
import {
  bindAgoraLocalVideoTrack,
  bindAgoraRemoteVideoTrack,
  clearLocalVideoContainer,
} from "@/lib/community-messenger/call-local-video-pipeline";
import { canAttachCallV4VideoMedia } from "@/lib/community-messenger/call-v4/call-v4-connected-media-policy";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { readCallV4MediaState, useCallV4MediaStore } from "@/lib/community-messenger/call-v4/call-v4-media-state";
import { readCallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-store";
import {
  getCallV4AgoraClient,
  getCallV4AgoraLocalTracks,
  getCallV4AgoraRemoteVideoTrack,
  setCallV4AgoraLocalTracks,
  setCallV4AgoraRemoteVideoTrack,
} from "@/lib/community-messenger/call-v4/call-v4-agora";

const unpublishedLocalVideoByCallId = new Set<string>();
const callV4RearFacingRef = { current: false };

async function loadProvider() {
  return import("@/lib/community-messenger/call-provider/client");
}

export async function subscribeCallV4RemoteVideo(
  callId: string,
  client: IAgoraRTCClient,
  user: IAgoraRTCRemoteUser,
  container: HTMLElement | null,
): Promise<boolean> {
  if (!canAttachCallV4VideoMedia(readCallV4Phase())) return false;
  if (!user.hasVideo) return false;
  try {
    await client.subscribe(user, "video");
  } catch {
    return false;
  }
  const track = user.videoTrack;
  if (!track) return false;
  setCallV4AgoraRemoteVideoTrack(callId, track);
  if (!container) return false;
  const ok = await bindAgoraRemoteVideoTrack(track, container, { fit: "cover", mirror: false });
  if (ok) {
    useCallV4MediaStore.getState().setRemoteVideoReady(true);
    logCallV4("remote_video_subscribe", { callId, uid: user.uid });
  }
  return ok;
}

export async function publishCallV4LocalVideo(callId: string, container: HTMLElement | null): Promise<boolean> {
  const sid = callId.trim();
  if (!sid || !canAttachCallV4VideoMedia(readCallV4Phase())) return false;
  const client = getCallV4AgoraClient(sid);
  const tracks = getCallV4AgoraLocalTracks(sid);
  if (!client || !tracks) return false;
  logCallV4("local_video_publish_start", { callId: sid });
  if (tracks.videoTrack) {
    try {
      const track = tracks.videoTrack;
      const wasEnabled = track.enabled;
      if (!wasEnabled) {
        await track.setEnabled(true);
      }
      if (unpublishedLocalVideoByCallId.has(sid) || !wasEnabled) {
        await client.publish([track]);
        logCallV4("local_video_republish_existing_track", { callId: sid });
      }
      unpublishedLocalVideoByCallId.delete(sid);
      useCallV4MediaStore.getState().setCameraEnabled(true);
      useCallV4MediaStore.getState().setLocalVideoReady(true);
      logCallV4("local_video_publish_done", { callId: sid });
      if (!container) return true;
      const ok = await bindAgoraLocalVideoTrack(track, container, { fit: "cover", mirror: true });
      if (!ok) {
        useCallV4MediaStore.getState().setLocalVideoReady(false);
      }
      return ok;
    } catch {
      logCallV4("local_video_publish_failed", { callId: sid });
      return false;
    }
  }
  try {
    const provider = await loadProvider();
    const videoTrack = await provider.createCommunityMessengerAgoraVideoTrackOnly();
    const next = { ...tracks, videoTrack };
    await client.publish([videoTrack]);
    setCallV4AgoraLocalTracks(sid, next);
    unpublishedLocalVideoByCallId.delete(sid);
    useCallV4MediaStore.getState().setCameraEnabled(true);
    useCallV4MediaStore.getState().setLocalVideoReady(true);
    logCallV4("local_video_publish", { callId: sid });
    logCallV4("local_video_publish_done", { callId: sid });
    if (!container) return true;
    const ok = await bindAgoraLocalVideoTrack(videoTrack, container, { fit: "cover", mirror: true });
    if (!ok) useCallV4MediaStore.getState().setLocalVideoReady(false);
    return ok;
  } catch {
    logCallV4("local_video_publish_failed", { callId: sid });
    return false;
  }
}

export async function unpublishCallV4LocalVideo(callId: string, container: HTMLElement | null): Promise<void> {
  const sid = callId.trim();
  const client = getCallV4AgoraClient(sid);
  const tracks = getCallV4AgoraLocalTracks(sid);
  const videoTrack = tracks?.videoTrack;
  if (!client || !videoTrack) {
    if (container) clearLocalVideoContainer(container);
    useCallV4MediaStore.getState().setLocalVideoReady(false);
    useCallV4MediaStore.getState().setCameraEnabled(false);
    return;
  }
  try {
    videoTrack.setEnabled(false);
    await client.unpublish([videoTrack]);
  } catch {
    /* best-effort */
  }
  unpublishedLocalVideoByCallId.add(sid);
  if (container) clearLocalVideoContainer(container);
  useCallV4MediaStore.getState().setLocalVideoReady(false);
  useCallV4MediaStore.getState().setCameraEnabled(false);
  logCallV4("local_video_unpublish", { callId: sid });
}

export async function setCallV4MicEnabled(callId: string, enabled: boolean): Promise<void> {
  const tracks = getCallV4AgoraLocalTracks(callId.trim());
  const audio = tracks?.audioTrack;
  if (!audio) return;
  try {
    await audio.setEnabled(enabled);
    useCallV4MediaStore.getState().setMicEnabled(enabled);
  } catch {
    /* ignore */
  }
}

export function readCallV4LocalVideoTrack(callId: string): ILocalVideoTrack | null {
  return getCallV4AgoraLocalTracks(callId.trim())?.videoTrack ?? null;
}

export function readCallV4RemoteVideoTrack(callId: string): IRemoteVideoTrack | null {
  return getCallV4AgoraRemoteVideoTrack(callId.trim());
}

export function isCallV4VideoActive(callId: string): boolean {
  const sid = callId.trim();
  const identity = readCallV4MediaState();
  return Boolean(
    readCallV4LocalVideoTrack(sid) ||
      readCallV4RemoteVideoTrack(sid) ||
      identity.cameraEnabled ||
      identity.localVideoReady ||
      identity.remoteVideoReady,
  );
}

export function isCallV4CameraSwitchAvailable(callId: string): boolean {
  return isCommunityMessengerCameraSwitchSupported(readCallV4LocalVideoTrack(callId));
}

export async function switchCallV4CameraFacing(
  callId: string,
  container: HTMLElement | null,
): Promise<boolean> {
  const sid = callId.trim();
  if (!sid || !canAttachCallV4VideoMedia(readCallV4Phase())) return false;
  const videoTrack = readCallV4LocalVideoTrack(sid);
  if (!videoTrack || !isCommunityMessengerCameraSwitchSupported(videoTrack)) return false;
  const client = getCallV4AgoraClient(sid);
  if (!client || !getCallV4AgoraLocalTracks(sid)) return false;

  logCallV4("camera_switch_start", { callId: sid });
  try {
    const next = await switchCommunityMessengerCameraFacing({
      videoTrack,
      useRearFacingRef: callV4RearFacingRef,
      client,
      onReplacedVideoTrack: (replaced) => {
        const tracks = getCallV4AgoraLocalTracks(sid);
        if (tracks) {
          setCallV4AgoraLocalTracks(sid, { ...tracks, videoTrack: replaced });
        }
      },
      onAfterSwitch: async () => {
        const track = readCallV4LocalVideoTrack(sid);
        if (track && container) {
          await bindAgoraLocalVideoTrack(track, container, { fit: "cover", mirror: true });
        }
      },
    });
    const tracks = getCallV4AgoraLocalTracks(sid);
    if (tracks && tracks.videoTrack !== next) {
      setCallV4AgoraLocalTracks(sid, { ...tracks, videoTrack: next });
    }
    logCallV4("camera_switch_done", { callId: sid });
    return true;
  } catch {
    logCallV4("camera_switch_failed", { callId: sid });
    return false;
  }
}
