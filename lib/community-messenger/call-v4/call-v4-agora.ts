"use client";

import type {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  IRemoteAudioTrack,
  IRemoteVideoTrack,
} from "agora-rtc-sdk-ng";
import type { CommunityMessengerAgoraLocalTracks } from "@/lib/community-messenger/call-provider/client";
import { isCommunityMessengerAgoraAppConfigured } from "@/lib/community-messenger/call-provider/client-runtime";
import { callV4FetchAgoraToken } from "@/lib/community-messenger/call-v4/call-v4-api";
import {
  clearCallV4ConnectionWarm,
  resolveCallV4WarmConnection,
} from "@/lib/community-messenger/call-v4/call-v4-connection-warm";
import { triggerCallV4RemoteTerminalCheckFromAgora } from "@/lib/community-messenger/call-v4/call-v4-connected-terminal-watch";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import {
  attachCallV4NetworkQualityListener,
  detachCallV4NetworkQualityListener,
} from "@/lib/community-messenger/call-v4/call-v4-network-quality";
import { useCallV4MediaStore } from "@/lib/community-messenger/call-v4/call-v4-media-state";
import { markCallV4MediaConnected } from "@/lib/community-messenger/call-v4/call-v4-phase-bridge";
import {
  markCallV4AcceptPatchJoinableInflight,
  writeCallV4ConnectedGateAgoraSignals,
  clearCallV4ConnectedGateAgoraSignals,
} from "@/lib/community-messenger/call-v4/call-v4-connected-gate";
import { readCallV4Identity } from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CommunityMessengerManagedCallConnection } from "@/lib/community-messenger/types";
import { isLegacyWebCallEstablishmentRemoved } from "@/lib/call/native/legacy-web-call-establishment-removed";
import { isNativeEstablishmentOwned } from "@/lib/call/native/native-outgoing-bridge";

type CallV4AgoraSession = {
  callId: string;
  client: IAgoraRTCClient;
  localTracks: CommunityMessengerAgoraLocalTracks;
  remoteAudioTrack: IRemoteAudioTrack | null;
  connectedLogged: boolean;
};

let activeSession: CallV4AgoraSession | null = null;
const remoteVideoByCallId = new Map<string, IRemoteVideoTrack>();
const joinClaimed = new Set<string>();
const joinStartLogged = new Set<string>();
const joinSucceeded = new Set<string>();
const connectionByCallId = new Map<string, CommunityMessengerManagedCallConnection>();
let joinInFlight: Promise<boolean> | null = null;
let joinInFlightCallId: string | null = null;

async function loadCommunityMessengerCallProviderClient() {
  return import("@/lib/community-messenger/call-provider/client");
}

function formatAgoraError(error: unknown): { message: string; code: string | null } {
  if (error instanceof Error) {
    const code =
      "code" in error && typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : error.name || null;
    return { message: error.message, code };
  }
  return { message: String(error), code: null };
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
  writeCallV4ConnectedGateAgoraSignals(callId, { remoteAudioSubscribed: true });
  maybeLogConnected(callId, "remote_audio");
}

async function subscribeRemoteVideo(callId: string, client: IAgoraRTCClient, user: IAgoraRTCRemoteUser): Promise<void> {
  if (!user.hasVideo) return;
  try {
    await client.subscribe(user, "video");
  } catch {
    return;
  }
  const track = user.videoTrack;
  if (!track || activeSession?.callId !== callId) return;
  remoteVideoByCallId.set(callId, track);
  useCallV4MediaStore.getState().setRemoteVideoReady(true);
  logCallV4("remote_video_track_ready", { callId, uid: user.uid });
}

function attachRemoteHandlers(callId: string, client: IAgoraRTCClient): void {
  client.on("user-published", async (user: IAgoraRTCRemoteUser, mediaType) => {
    if (mediaType === "audio") {
      await subscribeRemoteAudio(callId, client, user);
      return;
    }
    if (mediaType === "video") {
      await subscribeRemoteVideo(callId, client, user);
    }
  });
  client.on("user-unpublished", (_user, mediaType) => {
    if (activeSession?.callId !== callId) return;
    if (mediaType === "audio") {
      activeSession.remoteAudioTrack = null;
      triggerCallV4RemoteTerminalCheckFromAgora(callId, _user.uid);
      return;
    }
    if (mediaType === "video") {
      remoteVideoByCallId.delete(callId);
      useCallV4MediaStore.getState().setRemoteVideoReady(false);
    }
  });
  client.on("user-left", (user: IAgoraRTCRemoteUser) => {
    if (activeSession?.callId !== callId) return;
    activeSession.remoteAudioTrack = null;
    triggerCallV4RemoteTerminalCheckFromAgora(callId, user.uid);
  });
  attachCallV4NetworkQualityListener(callId, client);
}

async function resolveCallV4AgoraConnection(
  callId: string,
  afterPatch = false,
): Promise<CommunityMessengerManagedCallConnection | null> {
  const sid = callId.trim();
  const cached = connectionByCallId.get(sid);
  if (cached) return cached;
  logCallV4("token_fetch_start", { callId: sid, afterPatch });
  const connection = await resolveCallV4WarmConnection(sid, () => callV4FetchAgoraToken(sid));
  if (!connection) {
    return null;
  }
  if (!connection.appId?.trim()) {
    logCallV4("agora_app_id_missing", { callId: sid });
    return null;
  }
  if (!connection.token?.trim()) {
    logCallV4("agora_token_missing", { callId: sid, channelName: connection.channelName ?? null });
    return null;
  }
  connectionByCallId.set(sid, connection);
  logCallV4("token_fetch_done", { callId: sid, channelName: connection.channelName ?? null, uid: connection.uid ?? null });
  return connection;
}

export function hasCallV4AgoraJoinSucceeded(callId: string): boolean {
  const sid = callId.trim();
  return Boolean(sid && (joinSucceeded.has(sid) || activeSession?.callId === sid));
}

export function resetCallV4AgoraJoinStateForCallId(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  joinClaimed.delete(sid);
  joinStartLogged.delete(sid);
  joinSucceeded.delete(sid);
  connectionByCallId.delete(sid);
  clearCallV4ConnectedGateAgoraSignals(sid);
  if (joinInFlightCallId === sid) {
    joinInFlight = null;
    joinInFlightCallId = null;
  }
}

async function abandonCallV4AgoraJoinClient(callId: string, client: IAgoraRTCClient): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;
  try {
    const provider = await loadCommunityMessengerCallProviderClient();
    await provider.cleanupCommunityMessengerAgoraCallResources({
      client,
      tracks: null,
      remoteAudioTrack: null,
      remoteVideoTrack: null,
    });
    logCallV4("agora_join_abandon_done", { callId: sid });
  } catch (error) {
    logCallV4("agora_join_abandon_failed", {
      callId: sid,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function joinCallV4Agora(
  callId: string,
  options?: { afterPatch?: boolean },
): Promise<boolean> {
  const sid = callId.trim();
  if (!sid) return false;
  if (isLegacyWebCallEstablishmentRemoved()) {
    logCallV4("legacy_web_establishment_removed", { callId: sid, source: "joinCallV4Agora" });
    return false;
  }
  if (await isNativeEstablishmentOwned(sid)) {
    logCallV4("web_agora_establishment_quarantined", { callId: sid });
    return false;
  }
  if (activeSession?.callId === sid || joinSucceeded.has(sid)) return true;
  if (joinStartLogged.has(sid) && !joinInFlight) {
    logCallV4("call_v4_join_guard_check", {
      callId: sid,
      blocked: true,
      reason: "join_already_attempted",
    });
    return false;
  }
  if (joinInFlight && joinInFlightCallId === sid) return joinInFlight;

  if (!joinClaimed.has(sid)) {
    joinClaimed.add(sid);
    joinInFlightCallId = sid;
    if (options?.afterPatch) {
      markCallV4AcceptPatchJoinableInflight(sid);
      writeCallV4ConnectedGateAgoraSignals(sid, { sessionStatus: "ringing" });
    }
    joinInFlight = (async (): Promise<boolean> => {
      if (!isCommunityMessengerAgoraAppConfigured()) {
        logCallV4("agora_app_id_missing", { callId: sid, source: "client_runtime" });
        return false;
      }
      let joinedClient: IAgoraRTCClient | null = null;
      try {
        const connection = await resolveCallV4AgoraConnection(sid, options?.afterPatch ?? false);
        if (!connection) {
          logCallV4("agora_join_not_ready", { callId: sid, reason: "connection_unavailable" });
          return false;
        }
        if (!joinStartLogged.has(sid)) {
          joinStartLogged.add(sid);
          logCallV4("agora_join_start", { callId: sid });
        }
        const provider = await loadCommunityMessengerCallProviderClient();
        const client = provider.createCommunityMessengerAgoraClient();
        joinedClient = client;
        attachRemoteHandlers(sid, client);
        logCallV4("client_join_start", {
          callId: sid,
          channelName: connection.channelName,
          uid: connection.uid,
        });
        try {
          await provider.joinCommunityMessengerAgoraChannel({
            client,
            appId: connection.appId,
            channelName: connection.channelName,
            token: connection.token,
            uid: connection.uid,
          });
          logCallV4("client_join_done", { callId: sid, channelName: connection.channelName });
        } catch (error) {
          const formatted = formatAgoraError(error);
          logCallV4("client_join_fail", {
            callId: sid,
            code: formatted.code,
            message: formatted.message,
          });
          throw error;
        }
        const trackKind = readCallV4Identity()?.mediaType === "video" ? "video" : "voice";
        logCallV4("local_audio_track_create_start", { callId: sid, trackKind });
        let tracks: CommunityMessengerAgoraLocalTracks;
        try {
          tracks = await provider.createCommunityMessengerAgoraLocalTracks(trackKind);
          logCallV4("local_audio_track_create_done", { callId: sid, trackKind });
        } catch (error) {
          const formatted = formatAgoraError(error);
          logCallV4("local_audio_track_create_fail", {
            callId: sid,
            code: formatted.code,
            message: formatted.message,
          });
          throw error;
        }
        if (trackKind === "video" && tracks.videoTrack) {
          logCallV4("local_video_publish_start", { callId: sid });
        }
        await provider.publishCommunityMessengerAgoraTracks({ client, tracks });
        joinSucceeded.add(sid);
        writeCallV4ConnectedGateAgoraSignals(sid, { agoraJoinSuccess: true });
        logCallV4("agora_join_success", { callId: sid });
        if (trackKind === "video" && tracks.videoTrack) {
          useCallV4MediaStore.getState().setCameraEnabled(true);
          useCallV4MediaStore.getState().setLocalVideoReady(true);
          logCallV4("local_video_publish_done", { callId: sid });
          writeCallV4ConnectedGateAgoraSignals(sid, { localVideoPublishDone: true });
        }
        activeSession = {
          callId: sid,
          client,
          localTracks: tracks,
          remoteAudioTrack: null,
          connectedLogged: false,
        };
        joinedClient = null;
        for (const user of client.remoteUsers) {
          await subscribeRemoteAudio(sid, client, user);
          if (user.hasVideo) {
            await subscribeRemoteVideo(sid, client, user);
          }
        }
        maybeLogConnected(sid, "agora_join");
        return true;
      } catch (error) {
        joinSucceeded.delete(sid);
        resetCallV4AgoraJoinStateForCallId(sid);
        if (joinedClient) {
          await abandonCallV4AgoraJoinClient(sid, joinedClient);
        }
        const formatted = formatAgoraError(error);
        logCallV4("agora_join_error", {
          callId: sid,
          code: formatted.code,
          message: formatted.message,
        });
        logCallV4("agora_join_not_ready", {
          callId: sid,
          reason: "join_failed",
          error: formatted.message,
          code: formatted.code,
        });
        return false;
      } finally {
        if (joinInFlightCallId === sid) {
          joinInFlight = null;
          joinInFlightCallId = null;
        }
      }
    })();
  }

  return joinInFlight ?? joinSucceeded.has(sid);
}

export function getCallV4AgoraClient(callId: string): IAgoraRTCClient | null {
  const sid = callId.trim();
  if (!sid || activeSession?.callId !== sid) return null;
  return activeSession.client;
}

export function getCallV4AgoraLocalTracks(callId: string): CommunityMessengerAgoraLocalTracks | null {
  const sid = callId.trim();
  if (!sid || activeSession?.callId !== sid) return null;
  return activeSession.localTracks;
}

export function setCallV4AgoraLocalTracks(callId: string, tracks: CommunityMessengerAgoraLocalTracks): void {
  const sid = callId.trim();
  if (!sid || activeSession?.callId !== sid) return;
  activeSession.localTracks = tracks;
}

export function getCallV4AgoraRemoteVideoTrack(callId: string): IRemoteVideoTrack | null {
  return remoteVideoByCallId.get(callId.trim()) ?? null;
}

export function setCallV4AgoraRemoteVideoTrack(callId: string, track: IRemoteVideoTrack | null): void {
  const sid = callId.trim();
  if (!sid) return;
  if (track) remoteVideoByCallId.set(sid, track);
  else remoteVideoByCallId.delete(sid);
}

export async function leaveCallV4Agora(callId?: string): Promise<void> {
  const sid = callId?.trim() || activeSession?.callId;
  if (!sid || !activeSession || activeSession.callId !== sid) return;
  const { client, localTracks, remoteAudioTrack } = activeSession;
  const remoteVideoTrack = remoteVideoByCallId.get(sid) ?? null;
  detachCallV4NetworkQualityListener(sid);
  activeSession = null;
  remoteVideoByCallId.delete(sid);
  resetCallV4AgoraJoinStateForCallId(sid);
  clearCallV4ConnectionWarm(sid);
  const provider = await loadCommunityMessengerCallProviderClient();
  await provider.cleanupCommunityMessengerAgoraCallResources({
    client,
    tracks: localTracks,
    remoteAudioTrack,
    remoteVideoTrack,
  });
  logCallV4("agora_leave_done", { callId: sid });
}
