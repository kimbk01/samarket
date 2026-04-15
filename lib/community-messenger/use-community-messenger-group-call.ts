"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  consumePrimedCommunityMessengerDevicePermission,
  discardPrimedCommunityMessengerDevicePermission,
} from "@/lib/community-messenger/call-permission";
import {
  acquireCommunityMessengerWebRtcStream,
  adoptCommunityMessengerWebRtcStream,
  migrateCommunityMessengerMediaSessionKey,
  releaseCommunityMessengerWebRtcMedia,
} from "@/lib/call/permission-manager";
import { bindMediaStreamToElement } from "@/lib/community-messenger/media-element";
import { fetchMessengerIceServers } from "@/lib/call/ice-servers";
import { buildMessengerRtcConfiguration } from "@/lib/call/webrtc-configuration";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import { playCommunityMessengerCallSignalSound } from "@/lib/community-messenger/call-feedback-sound";
import { getCommunityMessengerMediaErrorMessage } from "@/lib/community-messenger/media-errors";
import { MESSENGER_CALL_USER_MSG, SIGNAL_POLL_SOFT_ERROR } from "@/lib/community-messenger/messenger-call-user-messages";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import type {
  CommunityMessengerCallKind,
  CommunityMessengerCallParticipant,
  CommunityMessengerCallSession,
  CommunityMessengerCallSignal,
} from "@/lib/community-messenger/types";
import {
  messengerMonitorCallConnection,
  messengerMonitorCallPacketLoss,
  messengerMonitorCallReconnect,
  messengerMonitorSignalingPost,
} from "@/lib/community-messenger/monitoring/client";
import { estimateInboundPacketLossPercent } from "@/lib/community-messenger/monitoring/webrtc-stats";
import {
  applyRemoteOfferWithPerfectNegotiation,
  createPerfectNegotiationState,
  type PerfectNegotiationState,
} from "@/lib/call/perfect-negotiation";

type GroupCallPanelState = {
  kind: CommunityMessengerCallKind;
  mode: "dialing" | "incoming" | "connecting" | "active";
  sessionId: string | null;
  peerLabel: string;
};

type GroupCallEndedState = {
  kind: CommunityMessengerCallKind;
  peerLabel: string;
  reason: "ended" | "declined" | "missed" | "failed";
  endedAt: number;
  endedDurationSeconds: number | null;
};

type RemotePeer = {
  userId: string;
  label: string;
  stream: MediaStream;
};

type PeerTransportState = "new" | "connecting" | "connected" | "disconnected" | "failed" | "closed";

type Props = {
  enabled: boolean;
  roomId: string;
  viewerUserId: string;
  roomLabel: string;
  activeCall: CommunityMessengerCallSession | null;
  onRefresh: () => Promise<void> | void;
};

type BindRemoteVideo = (userId: string, node: HTMLVideoElement | null) => void;

const CALL_RING_TIMEOUT_MS = 35_000;
const GROUP_CALL_SIGNAL_POLL_MS_REALTIME_OK = 7_000;
const GROUP_CALL_SIGNAL_POLL_MS_FALLBACK = 2_000;
const GROUP_CALL_SIGNAL_POLL_MS_HIDDEN_TAB = 14_000;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readCandidateInit(payload: Record<string, unknown>): RTCIceCandidateInit | null {
  const candidate = payload.candidate;
  return isRecord(candidate) ? (candidate as RTCIceCandidateInit) : null;
}

function readSessionDescription(
  payload: Record<string, unknown>,
  expectedType: "offer" | "answer"
): RTCSessionDescriptionInit | null {
  const sdp = typeof payload.sdp === "string" ? payload.sdp.trim() : "";
  if (!sdp) return null;
  return { type: expectedType, sdp };
}

function shouldCreateOffer(selfUserId: string, peerUserId: string): boolean {
  return selfUserId.localeCompare(peerUserId) < 0;
}

export function useCommunityMessengerGroupCall(args: Props) {
  const [panel, setPanel] = useState<GroupCallPanelState | null>(null);
  const [endedPanel, setEndedPanel] = useState<GroupCallEndedState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [peerStates, setPeerStates] = useState<Record<string, PeerTransportState>>({});
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  /** 연속 `ensurePeerConnection`·`ensureLocalStream` 에서 GUM 중복 방지 (`setLocalStream` 비동기 반영 보완) */
  const localStreamHeldRef = useRef<MediaStream | null>(null);
  const remoteVideoNodesRef = useRef<Map<string, HTMLVideoElement | null>>(new Map());
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const negotiationByPeerRef = useRef<Map<string, PerfectNegotiationState>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const processedSignalIdsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const activeSinceRef = useRef<number | null>(null);
  const groupCallSignalsRealtimeSubscribedRef = useRef(false);
  const groupCallTerminalSoundPrevRef = useRef<{
    id: string;
    status: CommunityMessengerCallSession["status"];
  } | null>(null);
  const sessionDialStartRef = useRef<number | null>(null);
  const firstConnectionRecordedRef = useRef(false);
  const peerStatePrevRef = useRef<Record<string, PeerTransportState>>({});
  const reconnectAccumulatorRef = useRef(0);

  const currentSessionId = panel?.sessionId ?? args.activeCall?.id ?? null;
  const participants = args.activeCall?.participants ?? [];
  const joinedParticipants = useMemo(
    () => participants.filter((item) => item.status === "joined" && !item.isMe),
    [participants]
  );
  const myParticipant = participants.find((item) => item.isMe) ?? null;
  const amJoined = myParticipant?.status === "joined";
  const onGroupRoomRefreshRef = useRef(args.onRefresh);
  onGroupRoomRefreshRef.current = args.onRefresh;

  /**
   * 그룹 통화도 종료/거절/취소/부재 처리가 signaling(hangup)만으로 끝나지 않을 수 있다.
   * 세션 status 변화를 직접 구독해 room snapshot(onRefresh)이 즉시 갱신되도록 한다.
   */
  useEffect(() => {
    const sessionId = currentSessionId;
    if (!args.enabled || !sessionId) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    const sub = subscribeWithRetry({
      sb,
      name: `community-messenger-group-call-session:${sessionId}`,
      scope: "community-messenger-group-call:session",
      isCancelled: () => cancelled,
      build: (ch) =>
        ch.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "community_messenger_call_sessions",
            filter: `id=eq.${sessionId}`,
          },
          () => {
            void onGroupRoomRefreshRef.current();
          }
        ),
    });

    return () => {
      cancelled = true;
      sub.stop();
    };
  }, [args.enabled, currentSessionId]);

  const syncRemotePeerState = useCallback((userId: string, label: string, stream: MediaStream | null) => {
    setRemotePeers((prev) => {
      const next = prev.filter((item) => item.userId !== userId);
      if (stream) next.push({ userId, label, stream });
      return next.sort((a, b) => a.label.localeCompare(b.label, "ko"));
    });
  }, []);

  const cleanupPeer = useCallback(
    (userId: string) => {
      peerConnectionsRef.current.get(userId)?.close();
      peerConnectionsRef.current.delete(userId);
      negotiationByPeerRef.current.delete(userId);
      const stream = remoteStreamsRef.current.get(userId);
      for (const track of stream?.getTracks() ?? []) track.stop();
      remoteStreamsRef.current.delete(userId);
      pendingCandidatesRef.current.delete(userId);
      syncRemotePeerState(userId, userId, null);
      setPeerStates((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      const node = remoteVideoNodesRef.current.get(userId);
      if (node) node.srcObject = null;
    },
    [syncRemotePeerState]
  );

  const cleanupMedia = useCallback(() => {
    discardPrimedCommunityMessengerDevicePermission();
    releaseCommunityMessengerWebRtcMedia();
    for (const userId of [...peerConnectionsRef.current.keys()]) {
      cleanupPeer(userId);
    }
    for (const track of localStream?.getTracks() ?? []) track.stop();
    localStreamHeldRef.current = null;
    setLocalStream(null);
    setRemotePeers([]);
    processedSignalIdsRef.current.clear();
    activeSinceRef.current = null;
    setElapsedSeconds(0);
    setPeerStates({});
  }, [cleanupPeer, localStream]);

  const showEndedPanel = useCallback(
    (
      kind: CommunityMessengerCallKind,
      peerLabel: string,
      reason: GroupCallEndedState["reason"],
      endedAtMs: number
    ) => {
      setEndedPanel({
        kind,
        peerLabel,
        reason,
        endedAt: endedAtMs,
        endedDurationSeconds: connectedAt != null ? Math.max(0, Math.floor((endedAtMs - connectedAt) / 1000)) : null,
      });
    },
    [connectedAt]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanupMedia();
    };
  }, [cleanupMedia]);

  useEffect(() => {
    setConnectedAt(null);
    setEndedPanel(null);
  }, [currentSessionId]);

  useEffect(() => {
    if (!endedPanel) return;
    const timer = window.setTimeout(() => {
      setEndedPanel(null);
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [endedPanel]);

  useEffect(() => {
    const node = localVideoRef.current;
    if (!node) return;
    bindMediaStreamToElement(node, localStream, { muted: true });
    return () => {
      node.srcObject = null;
    };
  }, [localStream]);

  useEffect(() => {
    for (const peer of remotePeers) {
      const node = remoteVideoNodesRef.current.get(peer.userId);
      if (node) bindMediaStreamToElement(node, peer.stream);
    }
  }, [remotePeers]);

  useEffect(() => {
    if (panel?.mode !== "active") return;
    const startedAt = activeSinceRef.current ?? Date.now();
    activeSinceRef.current = startedAt;
    setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    const timer = setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [panel?.mode]);

  useEffect(() => {
    if (!panel || panel.mode === "incoming") return;
    const states = Object.values(peerStates);
    if (states.some((state) => state === "connected")) {
      setConnectedAt((prev) => prev ?? Date.now());
      setPanel((prev) => (prev ? { ...prev, mode: "active" } : prev));
      return;
    }
    if (states.some((state) => state === "connecting" || state === "new")) {
      setPanel((prev) => (prev ? { ...prev, mode: "connecting" } : prev));
    }
  }, [panel, peerStates]);

  const ensureLocalStream = useCallback(
    async (kind: CommunityMessengerCallKind) => {
      const held = localStreamHeldRef.current;
      if (held) return held;
      if (localStream) {
        localStreamHeldRef.current = localStream;
        return localStream;
      }
      const sessionKey = currentSessionId;
      const primed = consumePrimedCommunityMessengerDevicePermission(kind);
      if (primed) {
        if (!mountedRef.current) {
          for (const track of primed.getTracks()) track.stop();
          throw new Error("unmounted");
        }
        adoptCommunityMessengerWebRtcStream(sessionKey, primed, kind);
        localStreamHeldRef.current = primed;
        setLocalStream(primed);
        return primed;
      }
      const stream = await acquireCommunityMessengerWebRtcStream(kind, { sessionKey });
      if (!mountedRef.current) {
        for (const track of stream.getTracks()) track.stop();
        releaseCommunityMessengerWebRtcMedia();
        throw new Error("unmounted");
      }
      localStreamHeldRef.current = stream;
      setLocalStream(stream);
      return stream;
    },
    [currentSessionId, localStream]
  );

  const sendSignal = useCallback(
    async (
      sessionId: string,
      toUserId: string,
      signalType: "offer" | "answer" | "ice-candidate" | "hangup",
      payload: Record<string, unknown>
    ) => {
      const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}/signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId, signalType, payload }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      const ok = res.ok && json.ok !== false;
      messengerMonitorSignalingPost(sessionId, signalType, ok, res.status);
      /* 기존과 같이 예외를 던지지 않음 — 호출부 다수가 실패 처리 없음; 실패는 모니터링으로만 집계 */
    },
    []
  );

  const ensurePeerConnection = useCallback(
    async (kind: CommunityMessengerCallKind, sessionId: string, peer: CommunityMessengerCallParticipant) => {
      const existing = peerConnectionsRef.current.get(peer.userId);
      if (existing) return existing;
      const [stream, iceServers] = await Promise.all([ensureLocalStream(kind), fetchMessengerIceServers()]);
      const connection = new RTCPeerConnection(buildMessengerRtcConfiguration(iceServers));
      const nextRemoteStream = new MediaStream();
      remoteStreamsRef.current.set(peer.userId, nextRemoteStream);
      syncRemotePeerState(peer.userId, peer.label, nextRemoteStream);
      setPeerStates((prev) => ({ ...prev, [peer.userId]: "connecting" }));

      for (const track of stream.getTracks()) {
        connection.addTrack(track, stream);
      }

      connection.ontrack = (event) => {
        if (event.streams.length === 0) {
          nextRemoteStream.addTrack(event.track);
        }
        for (const streamItem of event.streams) {
          for (const track of streamItem.getTracks()) {
            nextRemoteStream.addTrack(track);
          }
        }
        syncRemotePeerState(peer.userId, peer.label, nextRemoteStream);
        const node = remoteVideoNodesRef.current.get(peer.userId);
        if (node) bindMediaStreamToElement(node, nextRemoteStream);
      };

      connection.onicecandidate = (event) => {
        if (!event.candidate) return;
        void sendSignal(sessionId, peer.userId, "ice-candidate", {
          candidate: event.candidate.toJSON(),
        }).catch(() => {
          /* ICE 전송 실패는 흔히 일시적 — 상위에서 재시도 */
        });
      };

      connection.onconnectionstatechange = () => {
        const state = connection.connectionState;
        const mapped: PeerTransportState =
          state === "connected"
            ? "connected"
            : state === "connecting" || state === "new"
              ? "connecting"
              : state === "disconnected"
                ? "disconnected"
                : state === "failed"
                  ? "failed"
                  : "closed";
        setPeerStates((prev) => ({ ...prev, [peer.userId]: mapped }));
        if (mapped === "failed") {
          setErrorMessage("일부 참여자와 연결이 불안정합니다. 다시 연결을 시도할 수 있습니다.");
        }
      };

      peerConnectionsRef.current.set(peer.userId, connection);
      return connection;
    },
    [ensureLocalStream, sendSignal, syncRemotePeerState]
  );

  const flushPendingCandidates = useCallback(async (peerUserId: string) => {
    const connection = peerConnectionsRef.current.get(peerUserId);
    if (!connection || !connection.remoteDescription) return;
    const queue = pendingCandidatesRef.current.get(peerUserId) ?? [];
    pendingCandidatesRef.current.set(peerUserId, []);
    await Promise.all(
      queue.map(async (candidate) => {
        try {
          await connection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          /* ignore candidate failures */
        }
      })
    );
  }, []);

  const createOfferForPeer = useCallback(
    async (peer: CommunityMessengerCallParticipant) => {
      if (!currentSessionId || !panel) return;
      try {
        const connection = await ensurePeerConnection(panel.kind, currentSessionId, peer);
        const offer = await connection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: panel.kind === "video",
        });
        await connection.setLocalDescription(offer);
        await sendSignal(currentSessionId, peer.userId, "offer", { sdp: offer.sdp ?? "" });
      } catch (error) {
        const errorName =
          typeof error === "object" && error && "name" in error
            ? String((error as { name?: unknown }).name ?? "")
            : "";
        if (errorName) {
          setErrorMessage(getCommunityMessengerMediaErrorMessage(error, panel.kind));
        }
      }
    },
    [currentSessionId, ensurePeerConnection, panel, sendSignal]
  );

  const applySignal = useCallback(
    async (signal: CommunityMessengerCallSignal) => {
      if (!String(args.viewerUserId ?? "").trim()) return;
      if (!messengerUserIdsEqual(signal.toUserId, args.viewerUserId)) return;
      if (processedSignalIdsRef.current.has(signal.id)) return;
      processedSignalIdsRef.current.add(signal.id);

      const peer =
        participants.find((item) => messengerUserIdsEqual(item.userId, signal.fromUserId)) ??
        ({
          userId: signal.fromUserId,
          label: signal.fromUserId,
          status: "joined",
          joinedAt: null,
          leftAt: null,
          isMe: false,
        } satisfies CommunityMessengerCallParticipant);
      const callKind = panel?.kind ?? args.activeCall?.callKind ?? "voice";

      if (signal.signalType === "offer") {
        const offer = readSessionDescription(signal.payload, "offer");
        if (!offer || !currentSessionId) return;
        const connection = await ensurePeerConnection(callKind, currentSessionId, peer);
        const st = negotiationByPeerRef.current.get(peer.userId) ?? createPerfectNegotiationState();
        negotiationByPeerRef.current.set(peer.userId, st);
        const polite = args.viewerUserId.localeCompare(peer.userId) > 0;
        const out = await applyRemoteOfferWithPerfectNegotiation({ pc: connection, st, offer, polite });
        if (!out.ok && out.ignored) return;
        await flushPendingCandidates(peer.userId);
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        await sendSignal(signal.sessionId, peer.userId, "answer", { sdp: answer.sdp ?? "" });
        return;
      }

      if (signal.signalType === "answer") {
        const answer = readSessionDescription(signal.payload, "answer");
        if (!answer) return;
        const connection = peerConnectionsRef.current.get(signal.fromUserId);
        if (!connection) return;
        if (!connection.currentRemoteDescription) {
          const st = negotiationByPeerRef.current.get(signal.fromUserId) ?? createPerfectNegotiationState();
          negotiationByPeerRef.current.set(signal.fromUserId, st);
          st.isSettingRemoteAnswerPending = true;
          await connection.setRemoteDescription(answer);
          st.isSettingRemoteAnswerPending = false;
          await flushPendingCandidates(signal.fromUserId);
        }
        return;
      }

      if (signal.signalType === "ice-candidate") {
        const candidate = readCandidateInit(signal.payload);
        if (!candidate) return;
        const connection = peerConnectionsRef.current.get(signal.fromUserId);
        if (!connection?.remoteDescription) {
          const queue = pendingCandidatesRef.current.get(signal.fromUserId) ?? [];
          queue.push(candidate);
          pendingCandidatesRef.current.set(signal.fromUserId, queue);
          return;
        }
        try {
          await connection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          /* ignore candidate failures */
        }
        return;
      }

      if (signal.signalType === "hangup") {
        cleanupPeer(signal.fromUserId);
      }
    },
    [args.activeCall?.callKind, args.viewerUserId, cleanupPeer, currentSessionId, ensurePeerConnection, flushPendingCandidates, panel?.kind, participants, sendSignal]
  );

  useEffect(() => {
    if (!args.enabled) return;
    const activeCall = args.activeCall;
    if (!activeCall || activeCall.sessionMode !== "group") {
      if (panel?.sessionId) {
        cleanupMedia();
        setPanel(null);
      }
      return;
    }

    if (activeCall.status === "ringing") {
      if (panel?.sessionId === activeCall.id && (panel.mode === "connecting" || panel.mode === "active")) {
        return;
      }
      if (myParticipant?.status === "joined" && activeCall.isMineInitiator) {
        setPanel({
          kind: activeCall.callKind,
          mode: "dialing",
          sessionId: activeCall.id,
          peerLabel: activeCall.peerLabel,
        });
        return;
      }
      if (myParticipant?.status === "invited") {
        setPanel({
          kind: activeCall.callKind,
          mode: "incoming",
          sessionId: activeCall.id,
          peerLabel: activeCall.peerLabel,
        });
        return;
      }
    }

    if (activeCall.status === "active") {
      if (panel?.sessionId === activeCall.id && (panel.mode === "connecting" || panel.mode === "active")) {
        return;
      }
      if (myParticipant?.status === "joined") {
        activeSinceRef.current = new Date(activeCall.answeredAt ?? activeCall.startedAt).getTime();
        setPanel({
          kind: activeCall.callKind,
          mode: Object.values(peerStates).some((state) => state === "connected") ? "active" : "connecting",
          sessionId: activeCall.id,
          peerLabel: activeCall.peerLabel,
        });
        return;
      }
      if (myParticipant?.status === "invited") {
        setPanel({
          kind: activeCall.callKind,
          mode: "incoming",
          sessionId: activeCall.id,
          peerLabel: activeCall.peerLabel,
        });
        return;
      }
    }

    if (activeCall.status === "ended" || activeCall.status === "cancelled" || activeCall.status === "missed" || activeCall.status === "rejected") {
      showEndedPanel(
        activeCall.callKind,
        activeCall.peerLabel,
        activeCall.status === "rejected"
          ? "declined"
          : activeCall.status === "missed"
            ? "missed"
            : activeCall.status === "cancelled"
              ? "failed"
              : "ended",
        activeCall.endedAt ? new Date(activeCall.endedAt).getTime() : Date.now()
      );
      cleanupMedia();
      setPanel(null);
    }
  }, [args.activeCall, args.enabled, cleanupMedia, myParticipant?.status, panel?.mode, panel?.sessionId, peerStates, showEndedPanel]);

  useEffect(() => {
    if (!args.enabled || !args.activeCall || args.activeCall.sessionMode !== "group") return;
    if (!args.activeCall.isMineInitiator || args.activeCall.status !== "ringing") return;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const patchRes = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(args.activeCall!.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "missed" }),
          });
          const patchJson = (await patchRes.json().catch(() => ({}))) as { ok?: boolean };
          if (!patchRes.ok || !patchJson.ok) {
            setErrorMessage(MESSENGER_CALL_USER_MSG.groupRingEndFailed);
            return;
          }
          cleanupMedia();
          showEndedPanel(args.activeCall!.callKind, args.activeCall!.peerLabel, "missed", Date.now());
          setPanel(null);
          setErrorMessage("참여자가 없어 그룹 통화 호출을 종료했습니다.");
          await args.onRefresh();
        } catch {
          setErrorMessage(MESSENGER_CALL_USER_MSG.groupRingEndFailed);
        }
      })();
    }, CALL_RING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [args, cleanupMedia, showEndedPanel]);

  useEffect(() => {
    if (!args.enabled || !currentSessionId || !panel) return;

    const anyPeerStillNegotiating =
      Object.keys(peerStates).length === 0 ||
      Object.values(peerStates).some((state) => state !== "connected");

    const needsSignalPoll =
      panel.mode === "dialing" ||
      panel.mode === "connecting" ||
      (panel.mode === "incoming" &&
        (args.activeCall?.status === "ringing" || args.activeCall?.status === "active")) ||
      (panel.mode === "active" && joinedParticipants.length > 0 && anyPeerStillNegotiating);

    if (!needsSignalPoll) return;

    const sessionId = currentSessionId;
    const sb = getSupabaseClient();
    let cancelled = false;
    let backoffUntil = 0;
    let timerId: number | null = null;
    let signalPollFailStreak = 0;
    let signalSoftErrorActive = false;

    const markSignalPollFailure = () => {
      signalPollFailStreak += 1;
      if (signalPollFailStreak >= 8 && !signalSoftErrorActive) {
        signalSoftErrorActive = true;
        setErrorMessage((prev) => prev ?? SIGNAL_POLL_SOFT_ERROR);
      }
    };

    const markSignalPollSuccess = () => {
      signalPollFailStreak = 0;
      if (signalSoftErrorActive) {
        signalSoftErrorActive = false;
        setErrorMessage((prev) => (prev === SIGNAL_POLL_SOFT_ERROR ? null : prev));
      }
    };

    async function bootstrapSignals() {
      const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}/signals`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; signals?: CommunityMessengerCallSignal[] };
      if (!res.ok || !json.ok) {
        markSignalPollFailure();
        return;
      }
      markSignalPollSuccess();
      for (const signal of json.signals ?? []) {
        if (cancelled) break;
        await applySignal(signal);
      }
    }

    function nextSignalPollGapMs(): number {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return GROUP_CALL_SIGNAL_POLL_MS_HIDDEN_TAB;
      }
      if (sb && groupCallSignalsRealtimeSubscribedRef.current) return GROUP_CALL_SIGNAL_POLL_MS_REALTIME_OK;
      return GROUP_CALL_SIGNAL_POLL_MS_FALLBACK;
    }

    async function pollSignals() {
      if (cancelled) return;
      if (Date.now() < backoffUntil) return;
      try {
        const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}/signals`, {
          cache: "no-store",
        });
        if (res.status === 429) {
          const ra = res.headers.get("Retry-After");
          const sec = Math.min(120, Math.max(1, Number.parseInt(ra ?? "", 10) || 5));
          backoffUntil = Date.now() + sec * 1000;
          markSignalPollFailure();
          return;
        }
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; signals?: CommunityMessengerCallSignal[] };
        if (!res.ok || !json.ok) {
          markSignalPollFailure();
          return;
        }
        markSignalPollSuccess();
        backoffUntil = 0;
        for (const signal of json.signals ?? []) {
          if (cancelled) break;
          await applySignal(signal);
        }
      } catch {
        markSignalPollFailure();
      }
    }

    async function runLoop() {
      while (!cancelled) {
        await pollSignals();
        if (cancelled) break;
        const base = nextSignalPollGapMs();
        const wait =
          Date.now() < backoffUntil
            ? Math.min(120_000, Math.max(0, backoffUntil - Date.now()) + 25)
            : base;
        await new Promise<void>((resolve) => {
          if (cancelled) {
            resolve();
            return;
          }
          timerId = window.setTimeout(() => {
            timerId = null;
            resolve();
          }, Math.max(200, wait));
        });
      }
    }

    const onVis = () => {
      if (cancelled || typeof document === "undefined") return;
      if (document.visibilityState === "visible") void pollSignals();
    };
    document.addEventListener("visibilitychange", onVis);

    groupCallSignalsRealtimeSubscribedRef.current = false;
    let sub: { stop: () => void } | null = null;
    if (sb) {
      sub = subscribeWithRetry({
        sb,
        name: `community-messenger-group-call-signals:${sessionId}:${args.viewerUserId}`,
        scope: "community-messenger-group-call:signals",
        isCancelled: () => cancelled,
        onStatus: (status) => {
          groupCallSignalsRealtimeSubscribedRef.current = status === "SUBSCRIBED";
        },
        build: (ch) =>
          ch.on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "community_messenger_call_signals",
              filter: `session_id=eq.${sessionId}`,
            },
            (payload) => {
              const row = payload.new as Record<string, unknown> | undefined;
              if (!row) return;
              void applySignal({
                id: String(row.id ?? ""),
                sessionId: String(row.session_id ?? ""),
                roomId: String(row.room_id ?? ""),
                fromUserId: String(row.from_user_id ?? ""),
                toUserId: String(row.to_user_id ?? ""),
                signalType: String(row.signal_type ?? "") as CommunityMessengerCallSignal["signalType"],
                payload: isRecord(row.payload) ? row.payload : {},
                createdAt: String(row.created_at ?? new Date().toISOString()),
              });
            }
          ),
      });
    }

    void (async () => {
      await bootstrapSignals();
      if (!cancelled) void runLoop();
    })();

    return () => {
      cancelled = true;
      groupCallSignalsRealtimeSubscribedRef.current = false;
      if (timerId != null) window.clearTimeout(timerId);
      document.removeEventListener("visibilitychange", onVis);
      sub?.stop();
    };
  }, [applySignal, args.activeCall?.status, args.enabled, args.viewerUserId, currentSessionId, joinedParticipants.length, panel, peerStates]);

  useEffect(() => {
    if (!args.enabled || !args.activeCall || args.activeCall.sessionMode !== "group") return;
    if (!amJoined || !currentSessionId || !panel) return;
    for (const peer of joinedParticipants) {
      if (peerConnectionsRef.current.has(peer.userId)) continue;
      if (!shouldCreateOffer(args.viewerUserId, peer.userId)) continue;
      void createOfferForPeer(peer);
    }
  }, [amJoined, args.activeCall, args.enabled, args.viewerUserId, createOfferForPeer, currentSessionId, joinedParticipants, panel]);

  const prepareDevices = useCallback(async () => {
    const kind = panel?.kind ?? args.activeCall?.callKind;
    if (!kind) return;
    setBusy("device-prepare");
    setErrorMessage(null);
    try {
      await ensureLocalStream(kind);
    } catch (error) {
      setErrorMessage(getCommunityMessengerMediaErrorMessage(error, kind));
    } finally {
      setBusy(null);
    }
  }, [args.activeCall?.callKind, ensureLocalStream, panel?.kind]);

  const dismissPanel = useCallback(() => {
    cleanupMedia();
    setPanel(null);
    setEndedPanel(null);
    setErrorMessage(null);
  }, [cleanupMedia]);

  const startOutgoingCall = useCallback(async (kind: CommunityMessengerCallKind) => {
    if (!args.enabled) return;
    setBusy("call-start");
    setErrorMessage(null);
    setEndedPanel(null);
    setPanel({
      kind,
      mode: "dialing",
      sessionId: null,
      peerLabel: args.roomLabel,
    });
    try {
      const res = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(args.roomId)}/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callKind: kind }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; session?: CommunityMessengerCallSession };
      if (!res.ok || !json.ok || !json.session) {
        setErrorMessage(
          json.error === "group_call_limit_exceeded"
            ? "그룹 통화는 현재 최대 4인까지만 지원합니다."
            : "그룹 통화 시작에 실패했습니다."
        );
        return;
      }
      setPanel({
        kind: json.session.callKind,
        mode: "dialing",
        sessionId: json.session.id,
        peerLabel: json.session.peerLabel,
      });
      migrateCommunityMessengerMediaSessionKey(null, json.session.id);
      await ensureLocalStream(kind);
      await args.onRefresh();
    } catch (error) {
      const errorName =
        typeof error === "object" && error && "name" in error
          ? String((error as { name?: unknown }).name ?? "")
          : "";
      setErrorMessage(errorName ? getCommunityMessengerMediaErrorMessage(error, kind) : "그룹 통화 시작에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }, [args, ensureLocalStream]);

  const acceptIncomingCall = useCallback(async (): Promise<boolean> => {
    const activeCall = args.activeCall;
    if (!args.enabled || !activeCall) return false;
    setBusy("call-accept");
    setErrorMessage(null);
    try {
      await ensureLocalStream(activeCall.callKind);
      const acceptRes = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(activeCall.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      const acceptJson = (await acceptRes.json().catch(() => ({}))) as { ok?: boolean };
      if (!acceptRes.ok || !acceptJson.ok) {
        setErrorMessage("그룹 통화 수락에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        return false;
      }
      activeSinceRef.current = Date.now();
      setPanel({
        kind: activeCall.callKind,
        mode: "connecting",
        sessionId: activeCall.id,
        peerLabel: activeCall.peerLabel,
      });
      await args.onRefresh();
      return true;
    } catch (error) {
      const errorName =
        typeof error === "object" && error && "name" in error
          ? String((error as { name?: unknown }).name ?? "")
          : "";
      setErrorMessage(errorName ? getCommunityMessengerMediaErrorMessage(error, activeCall.callKind) : "그룹 통화 참여를 시작하지 못했습니다.");
      return false;
    } finally {
      setBusy(null);
    }
  }, [args, ensureLocalStream]);

  const rejectIncomingCall = useCallback(async () => {
    const activeCall = args.activeCall;
    if (!args.enabled || !activeCall) return;
    setBusy("call-reject");
    try {
      const patchRes = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(activeCall.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      const patchJson = (await patchRes.json().catch(() => ({}))) as { ok?: boolean };
      if (!patchRes.ok || !patchJson.ok) {
        setErrorMessage(MESSENGER_CALL_USER_MSG.sessionRejectFailed);
        return;
      }
      cleanupMedia();
      showEndedPanel(activeCall.callKind, activeCall.peerLabel, "declined", Date.now());
      setPanel(null);
      await args.onRefresh();
    } finally {
      setBusy(null);
    }
  }, [args, cleanupMedia, showEndedPanel]);

  const cancelOutgoingCall = useCallback(async () => {
    const sessionId = currentSessionId;
    if (!args.enabled || !sessionId) return;
    setBusy("call-cancel");
    try {
      const patchRes = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const patchJson = (await patchRes.json().catch(() => ({}))) as { ok?: boolean };
      if (!patchRes.ok || !patchJson.ok) {
        setErrorMessage(MESSENGER_CALL_USER_MSG.groupCancelFailed);
        return;
      }
      cleanupMedia();
      showEndedPanel(panel?.kind ?? args.activeCall?.callKind ?? "voice", panel?.peerLabel ?? args.roomLabel, "ended", Date.now());
      setPanel(null);
      await args.onRefresh();
    } finally {
      setBusy(null);
    }
  }, [args, cleanupMedia, currentSessionId, panel, showEndedPanel]);

  const endActiveCall = useCallback(async () => {
    const sessionId = currentSessionId;
    if (!args.enabled || !sessionId) return;
    setBusy("call-end");
    try {
      for (const peer of joinedParticipants) {
        try {
          await sendSignal(sessionId, peer.userId, "hangup", { reason: "leave" });
        } catch {
          /* 개별 hangup 실패는 PATCH 종료로 정리 */
        }
      }
      const patchRes = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "end",
          durationSeconds: elapsedSeconds,
        }),
      });
      const patchJson = (await patchRes.json().catch(() => ({}))) as { ok?: boolean };
      if (!patchRes.ok || !patchJson.ok) {
        setErrorMessage(MESSENGER_CALL_USER_MSG.groupEndFailed);
        return;
      }
      cleanupMedia();
      showEndedPanel(panel?.kind ?? args.activeCall?.callKind ?? "voice", panel?.peerLabel ?? args.roomLabel, "ended", Date.now());
      setPanel(null);
      await args.onRefresh();
    } finally {
      setBusy(null);
    }
  }, [args, cleanupMedia, currentSessionId, elapsedSeconds, joinedParticipants, panel, sendSignal, showEndedPanel]);

  const retryConnection = useCallback(async () => {
    if (!args.enabled || !currentSessionId || !panel) return;
    setBusy("call-retry");
    setErrorMessage("그룹 연결을 다시 시도하고 있습니다.");
    try {
      for (const peer of joinedParticipants) {
        const connection = peerConnectionsRef.current.get(peer.userId);
        if (!connection) {
          if (shouldCreateOffer(args.viewerUserId, peer.userId)) {
            await createOfferForPeer(peer);
          }
          continue;
        }
        const offer = await connection.createOffer({
          iceRestart: true,
          offerToReceiveAudio: true,
          offerToReceiveVideo: panel.kind === "video",
        });
        await connection.setLocalDescription(offer);
        await sendSignal(currentSessionId, peer.userId, "offer", { sdp: offer.sdp ?? "" });
      }
    } finally {
      setBusy(null);
    }
  }, [args.enabled, args.viewerUserId, createOfferForPeer, currentSessionId, joinedParticipants, panel, sendSignal]);

  useEffect(() => {
    if (!args.enabled) {
      groupCallTerminalSoundPrevRef.current = null;
      return;
    }
    const ac = args.activeCall;
    if (!ac || ac.sessionMode !== "group") {
      groupCallTerminalSoundPrevRef.current = null;
      return;
    }
    const sid = ac.id;
    const st = ac.status;
    const prevPair = groupCallTerminalSoundPrevRef.current;
    if (!prevPair || prevPair.id !== sid) {
      groupCallTerminalSoundPrevRef.current = { id: sid, status: st };
      return;
    }
    const prevSt = prevPair.status;
    groupCallTerminalSoundPrevRef.current = { id: sid, status: st };
    if (prevSt === st) return;
    const wasLive = prevSt === "ringing" || prevSt === "active";
    if (!wasLive) return;
    if (st === "missed") {
      void playCommunityMessengerCallSignalSound("missed", { dedupeSessionId: sid });
    } else if (st === "ended") {
      void playCommunityMessengerCallSignalSound("call_end", { dedupeSessionId: sid });
    }
  }, [args.activeCall?.id, args.activeCall?.sessionMode, args.activeCall?.status, args.enabled]);

  useEffect(() => {
    sessionDialStartRef.current = null;
    firstConnectionRecordedRef.current = false;
    peerStatePrevRef.current = {};
    reconnectAccumulatorRef.current = 0;
  }, [currentSessionId]);

  useEffect(() => {
    if (!args.enabled || !currentSessionId || !panel) return;
    if (panel.mode === "connecting" || panel.mode === "active") {
      if (sessionDialStartRef.current === null) sessionDialStartRef.current = Date.now();
    }
  }, [args.enabled, currentSessionId, panel?.mode]);

  useEffect(() => {
    if (!currentSessionId || firstConnectionRecordedRef.current) return;
    const remotes = joinedParticipants.map((p) => p.userId);
    if (remotes.length === 0) return;
    const allOk = remotes.every((uid) => peerStates[uid] === "connected");
    if (allOk && sessionDialStartRef.current) {
      firstConnectionRecordedRef.current = true;
      const media = panel?.kind ?? args.activeCall?.callKind ?? "voice";
      messengerMonitorCallConnection(currentSessionId, Date.now() - sessionDialStartRef.current, media);
    }
  }, [args.activeCall?.callKind, currentSessionId, joinedParticipants, panel?.kind, peerStates]);

  useEffect(() => {
    if (!currentSessionId) return;
    const prevSnap = { ...peerStatePrevRef.current };
    let delta = 0;
    for (const uid of Object.keys(peerStates)) {
      const cur = peerStates[uid];
      const prev = prevSnap[uid];
      if (prev && (prev === "disconnected" || prev === "failed") && cur === "connected") {
        delta += 1;
      }
    }
    peerStatePrevRef.current = { ...peerStates };
    if (delta > 0) {
      reconnectAccumulatorRef.current += delta;
      messengerMonitorCallReconnect(currentSessionId, reconnectAccumulatorRef.current);
    }
  }, [currentSessionId, peerStates]);

  useEffect(() => {
    if (!args.enabled || panel?.mode !== "active" || !currentSessionId) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        const pcs = [...peerConnectionsRef.current.values()];
        const pc = pcs[0];
        if (!pc) return;
        const pct = await estimateInboundPacketLossPercent(pc);
        if (pct != null) messengerMonitorCallPacketLoss(currentSessionId, pct);
      })();
    }, 6000);
    return () => clearTimeout(timer);
  }, [args.enabled, currentSessionId, panel?.mode]);

  const callStatusLabel = useMemo(() => {
    if (!panel) return "";
    if (panel.mode === "dialing") return "참여자에게 거는 중";
    if (panel.mode === "incoming") return "수신 전화";
    if (panel.mode === "connecting") return "연결 중";
    return "그룹 통화 진행 중";
  }, [panel]);

  const connectionBadge = useMemo(() => {
    const states = Object.values(peerStates);
    if (states.length === 0) return panel?.mode === "active" ? { label: "참여자 연결 대기", tone: "normal" as const } : null;
    if (states.some((state) => state === "failed" || state === "disconnected")) {
      return { label: "일부 연결 불안정", tone: "poor" as const };
    }
    if (states.some((state) => state === "connecting" || state === "new")) {
      return { label: "참여자 연결 중", tone: "normal" as const };
    }
    return { label: "참여자 연결 안정", tone: "good" as const };
  }, [panel?.mode, peerStates]);

  const bindRemoteVideo: BindRemoteVideo = useCallback((userId, node) => {
    remoteVideoNodesRef.current.set(userId, node);
    const stream = remoteStreamsRef.current.get(userId);
    if (node) bindMediaStreamToElement(node, stream ?? null);
  }, []);

  return {
    panel,
    endedPanel,
    busy,
    errorMessage,
    elapsedSeconds,
    connectedAt,
    localStream,
    localVideoRef,
    remotePeers,
    bindRemoteVideo,
    callStatusLabel,
    connectionBadge,
    participants,
    prepareDevices,
    dismissPanel,
    startOutgoingCall,
    acceptIncomingCall,
    rejectIncomingCall,
    cancelOutgoingCall,
    endActiveCall,
    retryConnection,
  };
}

export type CommunityMessengerGroupCallHandle = ReturnType<typeof useCommunityMessengerGroupCall>;
