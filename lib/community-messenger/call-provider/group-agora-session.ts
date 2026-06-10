"use client";

import type {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ILocalAudioTrack,
  ILocalVideoTrack,
  IRemoteAudioTrack,
  IRemoteVideoTrack,
} from "agora-rtc-sdk-ng";
import {
  isCommunityMessengerCameraSwitchSupported,
  switchCommunityMessengerCameraFacing,
} from "@/lib/community-messenger/call-camera-switch";
import { AGORA_PEER_LEFT_END_GRACE_MS } from "@/lib/community-messenger/call-agora-reconnect-policy";
import { applyAgoraRemoteSpeakerPreference } from "@/lib/community-messenger/call-provider/agora-playback-routing";
import {
  cleanupCommunityMessengerAgoraCallResources,
  createCommunityMessengerAgoraClient,
  createCommunityMessengerAgoraLocalTracks,
  joinCommunityMessengerAgoraChannel,
  publishCommunityMessengerAgoraTracks,
  type CommunityMessengerAgoraLocalTracks,
} from "@/lib/community-messenger/call-provider/client";
import type { CommunityMessengerCallKind, CommunityMessengerManagedCallConnection } from "@/lib/community-messenger/types";

export type GroupAgoraRemotePeer = {
  userId: string;
  audioTrack: IRemoteAudioTrack | null;
  videoTrack: IRemoteVideoTrack | null;
};

export type GroupAgoraSessionCallbacks = {
  onRemotePeersChanged: (peers: GroupAgoraRemotePeer[]) => void;
  onAnyRemoteJoined: () => void;
  onAllRemotesLeft: () => void;
  onConnectionReconnecting: () => void;
  onConnectionRecovered: () => void;
  onConnectionDisconnected: () => void;
};

function remoteUidToUserId(uid: string | number): string {
  return String(uid ?? "").trim();
}

export class CommunityMessengerGroupAgoraSession {
  private client: IAgoraRTCClient | null = null;
  private localTracks: CommunityMessengerAgoraLocalTracks | null = null;
  private remoteByUserId = new Map<string, GroupAgoraRemotePeer>();
  private peerLeftTimer: ReturnType<typeof setTimeout> | null = null;
  private speakerEnabled = true;
  private viewerUserId = "";
  private useRearFacing = false;

  constructor(private readonly callbacks: GroupAgoraSessionCallbacks) {}

  getClient(): IAgoraRTCClient | null {
    return this.client;
  }

  getLocalTracks(): CommunityMessengerAgoraLocalTracks | null {
    return this.localTracks;
  }

  getRemotePeers(): GroupAgoraRemotePeer[] {
    return [...this.remoteByUserId.values()].sort((a, b) => a.userId.localeCompare(b.userId));
  }

  setSpeakerEnabled(enabled: boolean): void {
    this.speakerEnabled = enabled;
    for (const peer of this.remoteByUserId.values()) {
      if (peer.audioTrack) void applyAgoraRemoteSpeakerPreference(peer.audioTrack, enabled);
    }
  }

  playRemoteVideo(userId: string, node: HTMLVideoElement | null): void {
    const peer = this.remoteByUserId.get(userId);
    if (!node) return;
    if (!peer?.videoTrack) {
      node.srcObject = null;
      return;
    }
    try {
      peer.videoTrack.play(node);
    } catch {
      /* autoplay policy */
    }
  }

  playRemoteAudio(userId: string, node: HTMLAudioElement | null): void {
    const peer = this.remoteByUserId.get(userId);
    if (!node) return;
    if (!peer?.audioTrack) {
      node.srcObject = null;
      return;
    }
    try {
      peer.audioTrack.play();
    } catch {
      /* autoplay policy */
    }
  }

  private emitRemotePeers(): void {
    this.callbacks.onRemotePeersChanged(this.getRemotePeers());
    if (this.getRemotePeers().length > 0) this.callbacks.onAnyRemoteJoined();
  }

  private clearPeerLeftTimer(): void {
    if (this.peerLeftTimer != null) {
      clearTimeout(this.peerLeftTimer);
      this.peerLeftTimer = null;
    }
  }

  private scheduleAllRemotesLeftGrace(): void {
    this.clearPeerLeftTimer();
    this.peerLeftTimer = setTimeout(() => {
      this.peerLeftTimer = null;
      if (this.getRemotePeers().length === 0) this.callbacks.onAllRemotesLeft();
    }, AGORA_PEER_LEFT_END_GRACE_MS);
  }

  private upsertRemote(userId: string, patch: Partial<GroupAgoraRemotePeer>): void {
    const prev = this.remoteByUserId.get(userId) ?? {
      userId,
      audioTrack: null,
      videoTrack: null,
    };
    const next = { ...prev, ...patch, userId };
    if (!next.audioTrack && !next.videoTrack) {
      this.remoteByUserId.delete(userId);
    } else {
      this.remoteByUserId.set(userId, next);
    }
    this.clearPeerLeftTimer();
    this.emitRemotePeers();
    if (this.getRemotePeers().length === 0) this.scheduleAllRemotesLeftGrace();
  }

  private attachClientHandlers(client: IAgoraRTCClient): void {
    client.on("user-published", async (user: IAgoraRTCRemoteUser, mediaType) => {
      const userId = remoteUidToUserId(user.uid);
      if (!userId || userId === this.viewerUserId) return;
      try {
        await client.subscribe(user, mediaType);
      } catch {
        return;
      }
      if (mediaType === "audio" && user.audioTrack) {
        void applyAgoraRemoteSpeakerPreference(user.audioTrack, this.speakerEnabled);
        try {
          user.audioTrack.play();
        } catch {
          /* ignore */
        }
        this.upsertRemote(userId, { audioTrack: user.audioTrack });
      }
      if (mediaType === "video" && user.videoTrack) {
        this.upsertRemote(userId, { videoTrack: user.videoTrack });
      }
    });

    client.on("user-unpublished", (user, mediaType) => {
      const userId = remoteUidToUserId(user.uid);
      if (!userId) return;
      const prev = this.remoteByUserId.get(userId);
      if (!prev) return;
      if (mediaType === "video") {
        this.upsertRemote(userId, { videoTrack: null });
      }
    });

    client.on("user-left", (user) => {
      const userId = remoteUidToUserId(user.uid);
      if (!userId) return;
      this.remoteByUserId.delete(userId);
      this.emitRemotePeers();
      if (this.getRemotePeers().length === 0) this.scheduleAllRemotesLeftGrace();
    });

    client.on("connection-state-change", (cur) => {
      if (cur === "RECONNECTING") {
        this.callbacks.onConnectionReconnecting();
        return;
      }
      if (cur === "CONNECTED") {
        this.callbacks.onConnectionRecovered();
        return;
      }
      if (cur === "DISCONNECTED" || cur === "DISCONNECTING") {
        this.callbacks.onConnectionDisconnected();
      }
    });
  }

  async joinAndPublish(input: {
    viewerUserId: string;
    callKind: CommunityMessengerCallKind;
    connection: CommunityMessengerManagedCallConnection;
  }): Promise<void> {
    await this.cleanup();
    this.viewerUserId = input.viewerUserId.trim();
    const client = createCommunityMessengerAgoraClient();
    this.client = client;
    this.attachClientHandlers(client);
    await joinCommunityMessengerAgoraChannel({
      client,
      appId: input.connection.appId,
      channelName: input.connection.channelName,
      token: input.connection.token,
      uid: input.connection.uid,
    });
    if (input.callKind === "video") {
      try {
        const c = client as IAgoraRTCClient & { enableDualStream?: () => Promise<void> };
        await c.enableDualStream?.();
      } catch {
        /* optional */
      }
    }
    const tracks = await createCommunityMessengerAgoraLocalTracks(input.callKind);
    this.localTracks = tracks;
    await publishCommunityMessengerAgoraTracks({ client, tracks });
  }

  async setMicEnabled(enabled: boolean): Promise<void> {
    const at = this.localTracks?.audioTrack;
    if (!at) return;
    try {
      await at.setEnabled(enabled);
    } catch {
      /* ignore */
    }
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
    const vt = this.localTracks?.videoTrack;
    if (!vt) return;
    try {
      await vt.setEnabled(enabled);
    } catch {
      /* ignore */
    }
  }

  isCameraSwitchSupported(): boolean {
    return isCommunityMessengerCameraSwitchSupported(this.localTracks?.videoTrack ?? null);
  }

  async switchCameraFacing(localVideoNode?: HTMLVideoElement | null): Promise<void> {
    const vt = this.localTracks?.videoTrack;
    if (!vt || !isCommunityMessengerCameraSwitchSupported(vt)) return;
    const useRearFacingRef = { current: this.useRearFacing };
    const next = await switchCommunityMessengerCameraFacing({
      videoTrack: vt,
      useRearFacingRef,
      client: this.client,
      onReplacedVideoTrack: (replaced) => {
        const tracks = this.localTracks;
        if (tracks) {
          this.localTracks = { ...tracks, videoTrack: replaced };
        }
      },
      onAfterSwitch: () => {
        const node = localVideoNode ?? null;
        if (node) this.playLocalVideo(node);
      },
    });
    this.useRearFacing = useRearFacingRef.current;
    const tracks = this.localTracks;
    if (tracks && tracks.videoTrack !== next) {
      this.localTracks = { ...tracks, videoTrack: next };
    }
  }

  playLocalVideo(node: HTMLVideoElement | null): void {
    const vt = this.localTracks?.videoTrack;
    if (!node) return;
    if (!vt) {
      node.srcObject = null;
      return;
    }
    try {
      vt.play(node);
    } catch {
      /* ignore */
    }
  }

  async cleanup(): Promise<void> {
    this.clearPeerLeftTimer();
    const client = this.client;
    const tracks = this.localTracks;
    const remotes = this.getRemotePeers();
    this.client = null;
    this.localTracks = null;
    this.remoteByUserId.clear();
    this.callbacks.onRemotePeersChanged([]);
    if (!client && !tracks) return;
    await cleanupCommunityMessengerAgoraCallResources({
      client,
      tracks,
      remoteAudioTrack: remotes[0]?.audioTrack ?? null,
      remoteVideoTrack: remotes[0]?.videoTrack ?? null,
    });
  }
}

export async function fetchGroupAgoraConnection(sessionId: string): Promise<CommunityMessengerManagedCallConnection | null> {
  const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}/token`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    connection?: CommunityMessengerManagedCallConnection;
  };
  if (!res.ok || !json.ok || !json.connection) return null;
  return json.connection;
}

export type { ILocalAudioTrack, ILocalVideoTrack };
