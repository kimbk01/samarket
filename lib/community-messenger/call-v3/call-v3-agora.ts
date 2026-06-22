"use client";

import type { IAgoraRTCClient, IAgoraRTCRemoteUser, IRemoteAudioTrack } from "agora-rtc-sdk-ng";
import {
  cleanupCommunityMessengerAgoraCallResources,
  createCommunityMessengerAgoraClient,
  createCommunityMessengerAgoraLocalTracks,
  joinCommunityMessengerAgoraChannel,
  publishCommunityMessengerAgoraTracks,
  type CommunityMessengerAgoraLocalTracks,
} from "@/lib/community-messenger/call-provider/client";
import { isCommunityMessengerAgoraAppConfigured } from "@/lib/community-messenger/call-provider/client-runtime";
import { callV3FetchAgoraToken } from "@/lib/community-messenger/call-v3/call-v3-api";
import { logCallV3 } from "@/lib/community-messenger/call-v3/call-v3-debug";
import type { CommunityMessengerManagedCallConnection } from "@/lib/community-messenger/types";

type CallV3AgoraSession = {
  callId: string;
  client: IAgoraRTCClient;
  localTracks: CommunityMessengerAgoraLocalTracks;
  remoteAudioTrack: IRemoteAudioTrack | null;
  connectedLogged: boolean;
};

let activeSession: CallV3AgoraSession | null = null;
const joinClaimed = new Set<string>();
const tokenFetched = new Set<string>();
const connectionByCallId = new Map<string, CommunityMessengerManagedCallConnection>();
let joinInFlight: Promise<boolean> | null = null;
let joinInFlightCallId: string | null = null;

function maybeLogConnected(callId: string): void {
  const session = activeSession;
  if (!session || session.callId !== callId || session.connectedLogged) return;
  session.connectedLogged = true;
  logCallV3("connected", { callId });
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
  logCallV3("remote_audio_subscribe", { callId, uid: user.uid });
  maybeLogConnected(callId);
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

async function resolveCallV3AgoraConnection(callId: string): Promise<CommunityMessengerManagedCallConnection | null> {
  const cached = connectionByCallId.get(callId);
  if (cached) {
    return cached;
  }
  if (tokenFetched.has(callId)) {
    return null;
  }

  logCallV3("token_fetch_start", { callId });
  const connection = await callV3FetchAgoraToken(callId);
  if (!connection) {
    return null;
  }
  tokenFetched.add(callId);
  connectionByCallId.set(callId, connection);
  logCallV3("token_fetch_done", { callId });
  return connection;
}

export function resetCallV3AgoraForTests(): void {
  activeSession = null;
  joinClaimed.clear();
  tokenFetched.clear();
  connectionByCallId.clear();
  joinInFlight = null;
  joinInFlightCallId = null;
}

export function readCallV3AgoraJoinedCallId(): string | null {
  return activeSession?.callId ?? null;
}

export function readCallV3AgoraGateStateForTests(): {
  joinClaimed: Set<string>;
  tokenFetched: Set<string>;
  activeCallId: string | null;
} {
  return {
    joinClaimed: new Set(joinClaimed),
    tokenFetched: new Set(tokenFetched),
    activeCallId: activeSession?.callId ?? null,
  };
}

/**
 * Join Agora once per callId — audio-only 1:1 (Phase D).
 */
export async function joinCallV3Agora(callId: string): Promise<boolean> {
  const sid = callId.trim();
  if (!sid) return false;

  if (activeSession?.callId === sid) {
    return true;
  }

  if (joinInFlight && joinInFlightCallId === sid) {
    return joinInFlight;
  }

  const flight = (async (): Promise<boolean> => {
    if (!isCommunityMessengerAgoraAppConfigured()) {
      return false;
    }
    if (joinClaimed.has(sid)) {
      return activeSession?.callId === sid;
    }
    joinClaimed.add(sid);

    try {
      const connection = await resolveCallV3AgoraConnection(sid);
      if (!connection) {
        joinClaimed.delete(sid);
        return false;
      }

      logCallV3("agora_join_start", { callId: sid });
      const client = createCommunityMessengerAgoraClient();
      attachRemoteHandlers(sid, client);

      await joinCommunityMessengerAgoraChannel({
        client,
        appId: connection.appId,
        channelName: connection.channelName,
        token: connection.token,
        uid: connection.uid,
      });
      logCallV3("agora_join_success", { callId: sid });

      logCallV3("local_audio_publish_start", { callId: sid });
      const tracks = await createCommunityMessengerAgoraLocalTracks("voice");
      await publishCommunityMessengerAgoraTracks({ client, tracks });
      logCallV3("local_audio_publish_done", { callId: sid });

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

      maybeLogConnected(sid);
      return true;
    } catch {
      joinClaimed.delete(sid);
      return false;
    }
  })();

  joinInFlight = flight;
  joinInFlightCallId = sid;
  try {
    return await flight;
  } finally {
    if (joinInFlightCallId === sid) {
      joinInFlight = null;
      joinInFlightCallId = null;
    }
  }
}

export async function leaveCallV3Agora(callId?: string): Promise<void> {
  const sid = callId?.trim() || activeSession?.callId;
  if (!sid || !activeSession || activeSession.callId !== sid) {
    return;
  }

  const { client, localTracks, remoteAudioTrack } = activeSession;
  activeSession = null;
  joinClaimed.delete(sid);
  connectionByCallId.delete(sid);

  await cleanupCommunityMessengerAgoraCallResources({
    client,
    tracks: localTracks,
    remoteAudioTrack,
  });
  logCallV3("agora_leave_done", { callId: sid });
}
