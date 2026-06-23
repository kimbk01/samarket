"use client";

import type { IAgoraRTCClient, IAgoraRTCRemoteUser, IRemoteAudioTrack } from "agora-rtc-sdk-ng";
import type { CommunityMessengerAgoraLocalTracks } from "@/lib/community-messenger/call-provider/client";
import { isCommunityMessengerAgoraAppConfigured } from "@/lib/community-messenger/call-provider/client-runtime";
import { callV4FetchAgoraToken } from "@/lib/community-messenger/call-v4/call-v4-api";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { markCallV4MediaConnected } from "@/lib/community-messenger/call-v4/call-v4-phase-bridge";
import type { CommunityMessengerManagedCallConnection } from "@/lib/community-messenger/types";

type CallV4AgoraSession = {
  callId: string;
  client: IAgoraRTCClient;
  localTracks: CommunityMessengerAgoraLocalTracks;
  remoteAudioTrack: IRemoteAudioTrack | null;
  connectedLogged: boolean;
};

let activeSession: CallV4AgoraSession | null = null;
const joinClaimed = new Set<string>();
const tokenFetched = new Set<string>();
const connectionByCallId = new Map<string, CommunityMessengerManagedCallConnection>();
let joinInFlight: Promise<boolean> | null = null;
let joinInFlightCallId: string | null = null;

async function loadCommunityMessengerCallProviderClient() {
  return import("@/lib/community-messenger/call-provider/client");
}

function maybeLogConnected(callId: string, source: string): void {
  const session = activeSession;
  if (!session || session.callId !== callId || session.connectedLogged) return;
  session.connectedLogged = true;
  logCallV4("connected", { callId, source });
  markCallV4MediaConnected(callId, source);
}

async function subscribeRemoteAudio(callId: string, client: IAgoraRTCClient, user: IAgoraRTCRemoteUser): Promise<void> {
  if (!user.hasAudio) return;
  try {
    await client.subscribe(user, "audio");
  } catch {
    return;
  }
  if (!user.audioTrack || activeSession?.callId !== callId) return;
  activeSession.remoteAudioTrack = user.audioTrack;
  try {
    user.audioTrack.play();
  } catch {
    /* autoplay policy */
  }
  logCallV4("remote_audio_subscribe", { callId, uid: user.uid });
  maybeLogConnected(callId, "remote_audio");
}

function attachRemoteHandlers(callId: string, client: IAgoraRTCClient): void {
  client.on("user-published", async (user: IAgoraRTCRemoteUser, mediaType) => {
    if (mediaType !== "audio") return;
    await subscribeRemoteAudio(callId, client, user);
  });
  client.on("user-unpublished", (_user, mediaType) => {
    if (mediaType !== "audio" || activeSession?.callId !== callId) return;
    activeSession.remoteAudioTrack = null;
  });
}

async function resolveCallV4AgoraConnection(callId: string): Promise<CommunityMessengerManagedCallConnection | null> {
  const cached = connectionByCallId.get(callId);
  if (cached) return cached;
  if (tokenFetched.has(callId)) return null;
  logCallV4("token_fetch_start", { callId });
  const connection = await callV4FetchAgoraToken(callId);
  if (!connection) return null;
  tokenFetched.add(callId);
  connectionByCallId.set(callId, connection);
  logCallV4("token_fetch_done", { callId });
  return connection;
}

export async function joinCallV4Agora(callId: string): Promise<boolean> {
  const sid = callId.trim();
  if (!sid) return false;
  if (activeSession?.callId === sid) return true;
  if (joinInFlight && joinInFlightCallId === sid) return joinInFlight;

  if (!joinClaimed.has(sid)) {
    joinClaimed.add(sid);
    joinInFlightCallId = sid;
    joinInFlight = (async (): Promise<boolean> => {
      if (!isCommunityMessengerAgoraAppConfigured()) {
        joinClaimed.delete(sid);
        return false;
      }
      try {
        const connection = await resolveCallV4AgoraConnection(sid);
        if (!connection) {
          joinClaimed.delete(sid);
          return false;
        }
        logCallV4("agora_join_start", { callId: sid });
        const provider = await loadCommunityMessengerCallProviderClient();
        const client = provider.createCommunityMessengerAgoraClient();
        attachRemoteHandlers(sid, client);
        await provider.joinCommunityMessengerAgoraChannel({
          client,
          appId: connection.appId,
          channelName: connection.channelName,
          token: connection.token,
          uid: connection.uid,
        });
        logCallV4("agora_join_success", { callId: sid });
        const tracks = await provider.createCommunityMessengerAgoraLocalTracks("voice");
        await provider.publishCommunityMessengerAgoraTracks({ client, tracks });
        activeSession = {
          callId: sid,
          client,
          localTracks: tracks,
          remoteAudioTrack: null,
          connectedLogged: false,
        };
        for (const user of client.remoteUsers) {
          await subscribeRemoteAudio(sid, client, user);
        }
        maybeLogConnected(sid, "agora_join");
        return true;
      } catch {
        joinClaimed.delete(sid);
        return false;
      } finally {
        if (joinInFlightCallId === sid) {
          joinInFlight = null;
          joinInFlightCallId = null;
        }
      }
    })();
  }

  return joinInFlight ?? activeSession?.callId === sid;
}

export async function leaveCallV4Agora(callId?: string): Promise<void> {
  const sid = callId?.trim() || activeSession?.callId;
  if (!sid || !activeSession || activeSession.callId !== sid) return;
  const { client, localTracks, remoteAudioTrack } = activeSession;
  activeSession = null;
  joinClaimed.delete(sid);
  connectionByCallId.delete(sid);
  const provider = await loadCommunityMessengerCallProviderClient();
  await provider.cleanupCommunityMessengerAgoraCallResources({
    client,
    tracks: localTracks,
    remoteAudioTrack,
  });
  logCallV4("agora_leave_done", { callId: sid });
}
