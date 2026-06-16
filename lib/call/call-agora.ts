"use client";

import type { IAgoraRTCClient, IRemoteAudioTrack, IRemoteVideoTrack } from "agora-rtc-sdk-ng";
import type { CommunityMessengerCallKind, CommunityMessengerManagedCallConnection } from "@/lib/community-messenger/types";
import type { CommunityMessengerAgoraLocalTracks } from "@/lib/community-messenger/call-provider/client";
import { logCall } from "@/lib/call/call-log";

let activeClient: IAgoraRTCClient | null = null;
let activeLocalTracks: CommunityMessengerAgoraLocalTracks | null = null;
let activeSessionId: string | null = null;
let remoteAudioTrack: IRemoteAudioTrack | null = null;
let remoteVideoTrack: IRemoteVideoTrack | null = null;

export type CallAgoraJoinResult = {
  client: IAgoraRTCClient;
  localTracks: CommunityMessengerAgoraLocalTracks;
};

export async function callAgoraJoin(input: {
  sessionId: string;
  kind: CommunityMessengerCallKind;
  connection: CommunityMessengerManagedCallConnection;
  onRemoteUserPublished?: (hasVideo: boolean) => void;
}): Promise<CallAgoraJoinResult> {
  const provider = await import("@/lib/community-messenger/call-provider/client");
  if (activeSessionId && activeSessionId !== input.sessionId) {
    await callAgoraLeave();
  }
  const client = provider.createCommunityMessengerAgoraClient();
  const localTracks = await provider.createCommunityMessengerAgoraLocalTracks(input.kind);
  await provider.joinCommunityMessengerAgoraChannel({
    client,
    appId: input.connection.appId,
    channelName: input.connection.channelName,
    token: input.connection.token,
    uid: input.connection.uid,
  });
  await provider.publishCommunityMessengerAgoraTracks({ client, tracks: localTracks });

  client.on("user-published", async (user, mediaType) => {
    await client.subscribe(user, mediaType);
    if (mediaType === "audio" && user.audioTrack) {
      remoteAudioTrack = user.audioTrack;
      user.audioTrack.play();
    }
    if (mediaType === "video" && user.videoTrack) {
      remoteVideoTrack = user.videoTrack;
      input.onRemoteUserPublished?.(true);
    }
  });

  client.on("user-unpublished", (_user, mediaType) => {
    if (mediaType === "video") remoteVideoTrack = null;
    if (mediaType === "audio") remoteAudioTrack = null;
  });

  activeClient = client;
  activeLocalTracks = localTracks;
  activeSessionId = input.sessionId;
  logCall("agora", "joined", { sessionId: input.sessionId });
  return { client, localTracks };
}

export async function callAgoraLeave(): Promise<void> {
  const provider = await import("@/lib/community-messenger/call-provider/client");
  await provider.cleanupCommunityMessengerAgoraCallResources({
    client: activeClient,
    tracks: activeLocalTracks,
    remoteAudioTrack,
    remoteVideoTrack,
  });
  if (activeSessionId) logCall("agora", "leave", { sessionId: activeSessionId });
  activeClient = null;
  activeLocalTracks = null;
  activeSessionId = null;
  remoteAudioTrack = null;
  remoteVideoTrack = null;
}

export function callGetActiveLocalTracks(): CommunityMessengerAgoraLocalTracks | null {
  return activeLocalTracks;
}

export function callGetRemoteVideoTrack(): IRemoteVideoTrack | null {
  return remoteVideoTrack;
}

export function callGetRemoteAudioTrack(): IRemoteAudioTrack | null {
  return remoteAudioTrack;
}

export async function callAgoraCreateVideoPreview(): Promise<import("agora-rtc-sdk-ng").ILocalVideoTrack | null> {
  const provider = await import("@/lib/community-messenger/call-provider/client");
  try {
    return await provider.createCommunityMessengerAgoraVideoTrackOnly();
  } catch {
    return null;
  }
}

export function callBindLocalVideo(el: HTMLElement | null): void {
  const track = activeLocalTracks?.videoTrack;
  if (!el || !track) return;
  try {
    track.play(el);
  } catch {
    /* */
  }
}

export function callBindRemoteVideo(el: HTMLElement | null): void {
  if (!el || !remoteVideoTrack) return;
  try {
    remoteVideoTrack.play(el);
  } catch {
    /* */
  }
}
