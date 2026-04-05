"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  consumePrimedCommunityMessengerDevicePermission,
  discardPrimedCommunityMessengerDevicePermission,
} from "@/lib/community-messenger/call-permission";
import { bindMediaStreamToElement } from "@/lib/community-messenger/media-element";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getCommunityMessengerMediaErrorMessage } from "@/lib/community-messenger/media-errors";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import type {
  CommunityMessengerCallKind,
  CommunityMessengerCallParticipant,
  CommunityMessengerCallSession,
  CommunityMessengerCallSignal,
} from "@/lib/community-messenger/types";

type GroupCallPanelState = {
  kind: CommunityMessengerCallKind;
  mode: "dialing" | "incoming" | "connecting" | "active";
  sessionId: string | null;
  peerLabel: string;
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
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

let cachedIceServers: RTCIceServer[] | null = null;
let cachedIceServersPromise: Promise<RTCIceServer[]> | null = null;

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

async function getCommunityMessengerIceServers(): Promise<RTCIceServer[]> {
  if (cachedIceServers) return cachedIceServers;
  if (cachedIceServersPromise) return cachedIceServersPromise;
  cachedIceServersPromise = fetch("/api/community-messenger/calls/ice-servers", {
    cache: "no-store",
  })
    .then(async (res) => {
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        iceServers?: RTCIceServer[];
      };
      if (!res.ok || !json.ok || !Array.isArray(json.iceServers) || json.iceServers.length === 0) {
        cachedIceServers = DEFAULT_ICE_SERVERS;
        return cachedIceServers;
      }
      cachedIceServers = json.iceServers;
      return cachedIceServers;
    })
    .catch(() => {
      cachedIceServers = DEFAULT_ICE_SERVERS;
      return cachedIceServers;
    })
    .finally(() => {
      cachedIceServersPromise = null;
    });
  return cachedIceServersPromise;
}

function shouldCreateOffer(selfUserId: string, peerUserId: string): boolean {
  return selfUserId.localeCompare(peerUserId) < 0;
}

export function useCommunityMessengerGroupCall(args: Props) {
  const [panel, setPanel] = useState<GroupCallPanelState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [peerStates, setPeerStates] = useState<Record<string, PeerTransportState>>({});
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoNodesRef = useRef<Map<string, HTMLVideoElement | null>>(new Map());
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const processedSignalIdsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const activeSinceRef = useRef<number | null>(null);

  const currentSessionId = panel?.sessionId ?? args.activeCall?.id ?? null;
  const participants = args.activeCall?.participants ?? [];
  const joinedParticipants = useMemo(
    () => participants.filter((item) => item.status === "joined" && !item.isMe),
    [participants]
  );
  const myParticipant = participants.find((item) => item.isMe) ?? null;
  const amJoined = myParticipant?.status === "joined";

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
    for (const userId of [...peerConnectionsRef.current.keys()]) {
      cleanupPeer(userId);
    }
    for (const track of localStream?.getTracks() ?? []) track.stop();
    setLocalStream(null);
    setRemotePeers([]);
    processedSignalIdsRef.current.clear();
    activeSinceRef.current = null;
    setElapsedSeconds(0);
    setPeerStates({});
  }, [cleanupPeer, localStream]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanupMedia();
    };
  }, [cleanupMedia]);

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
      setPanel((prev) => (prev ? { ...prev, mode: "active" } : prev));
      return;
    }
    if (states.some((state) => state === "connecting" || state === "new")) {
      setPanel((prev) => (prev ? { ...prev, mode: "connecting" } : prev));
    }
  }, [panel, peerStates]);

  const ensureLocalStream = useCallback(
    async (kind: CommunityMessengerCallKind) => {
      if (localStream) return localStream;
      const primed = consumePrimedCommunityMessengerDevicePermission(kind);
      if (primed) {
        if (!mountedRef.current) {
          for (const track of primed.getTracks()) track.stop();
          throw new Error("unmounted");
        }
        setLocalStream(primed);
        return primed;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: kind === "video",
      });
      if (!mountedRef.current) {
        for (const track of stream.getTracks()) track.stop();
        throw new Error("unmounted");
      }
      setLocalStream(stream);
      return stream;
    },
    [localStream]
  );

  const sendSignal = useCallback(
    async (
      sessionId: string,
      toUserId: string,
      signalType: "offer" | "answer" | "ice-candidate" | "hangup",
      payload: Record<string, unknown>
    ) => {
      await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}/signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId, signalType, payload }),
      });
    },
    []
  );

  const ensurePeerConnection = useCallback(
    async (kind: CommunityMessengerCallKind, sessionId: string, peer: CommunityMessengerCallParticipant) => {
      const existing = peerConnectionsRef.current.get(peer.userId);
      if (existing) return existing;
      const stream = await ensureLocalStream(kind);
      const iceServers = await getCommunityMessengerIceServers();
      const connection = new RTCPeerConnection({ iceServers });
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
    for (const candidate of queue) {
      try {
        await connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        /* ignore candidate failures */
      }
    }
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
        await connection.setRemoteDescription(offer);
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
          await connection.setRemoteDescription(answer);
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
      cleanupMedia();
      setPanel(null);
    }
  }, [args.activeCall, args.enabled, cleanupMedia, myParticipant?.status, panel?.sessionId, peerStates]);

  useEffect(() => {
    if (!args.enabled || !args.activeCall || args.activeCall.sessionMode !== "group") return;
    if (!args.activeCall.isMineInitiator || args.activeCall.status !== "ringing") return;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(args.activeCall!.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "missed" }),
          });
          cleanupMedia();
          setPanel(null);
          setErrorMessage("참여자가 없어 그룹 통화 호출을 종료했습니다.");
          await args.onRefresh();
        } catch {
          /* ignore timeout failure */
        }
      })();
    }, CALL_RING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [args, cleanupMedia]);

  useEffect(() => {
    if (!args.enabled || !currentSessionId) return;
    const sessionId = currentSessionId;
    const sb = getSupabaseClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    async function bootstrapSignals() {
      const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}/signals`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; signals?: CommunityMessengerCallSignal[] };
      if (!res.ok || !json.ok) return;
      for (const signal of json.signals ?? []) {
        if (cancelled) break;
        await applySignal(signal);
      }
    }

    void bootstrapSignals();
    if (sb) {
      channel = sb
        .channel(`community-messenger-group-call-signals:${sessionId}:${args.viewerUserId}`)
        .on(
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
        )
        .subscribe();
    }

    return () => {
      cancelled = true;
      if (sb && channel) void sb.removeChannel(channel);
    };
  }, [applySignal, args.enabled, args.viewerUserId, currentSessionId]);

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
    let cancelled = false;

    async function pollSignals() {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}/signals`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; signals?: CommunityMessengerCallSignal[] };
        if (!res.ok || !json.ok) return;
        for (const signal of json.signals ?? []) {
          if (cancelled) break;
          await applySignal(signal);
        }
      } catch {
        /* ignore */
      }
    }

    void pollSignals();
    const timer = window.setInterval(() => {
      void pollSignals();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [applySignal, args.activeCall?.status, args.enabled, currentSessionId, joinedParticipants.length, panel, peerStates]);

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
    setErrorMessage(null);
  }, [cleanupMedia]);

  const startOutgoingCall = useCallback(async (kind: CommunityMessengerCallKind) => {
    if (!args.enabled) return;
    setBusy("call-start");
    setErrorMessage(null);
    setPanel({
      kind,
      mode: "dialing",
      sessionId: null,
      peerLabel: args.roomLabel,
    });
    try {
      await ensureLocalStream(kind);
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

  const acceptIncomingCall = useCallback(async () => {
    const activeCall = args.activeCall;
    if (!args.enabled || !activeCall) return;
    setBusy("call-accept");
    setErrorMessage(null);
    try {
      await ensureLocalStream(activeCall.callKind);
      await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(activeCall.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      activeSinceRef.current = Date.now();
      setPanel({
        kind: activeCall.callKind,
        mode: "connecting",
        sessionId: activeCall.id,
        peerLabel: activeCall.peerLabel,
      });
      await args.onRefresh();
    } catch (error) {
      const errorName =
        typeof error === "object" && error && "name" in error
          ? String((error as { name?: unknown }).name ?? "")
          : "";
      setErrorMessage(errorName ? getCommunityMessengerMediaErrorMessage(error, activeCall.callKind) : "그룹 통화 참여를 시작하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }, [args, ensureLocalStream]);

  const rejectIncomingCall = useCallback(async () => {
    const activeCall = args.activeCall;
    if (!args.enabled || !activeCall) return;
    setBusy("call-reject");
    try {
      await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(activeCall.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      cleanupMedia();
      setPanel(null);
      await args.onRefresh();
    } finally {
      setBusy(null);
    }
  }, [args, cleanupMedia]);

  const cancelOutgoingCall = useCallback(async () => {
    const sessionId = currentSessionId;
    if (!args.enabled || !sessionId) return;
    setBusy("call-cancel");
    try {
      await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      cleanupMedia();
      setPanel(null);
      await args.onRefresh();
    } finally {
      setBusy(null);
    }
  }, [args, cleanupMedia, currentSessionId]);

  const endActiveCall = useCallback(async () => {
    const sessionId = currentSessionId;
    if (!args.enabled || !sessionId) return;
    setBusy("call-end");
    try {
      for (const peer of joinedParticipants) {
        await sendSignal(sessionId, peer.userId, "hangup", { reason: "leave" });
      }
      await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "end",
          durationSeconds: elapsedSeconds,
        }),
      });
      cleanupMedia();
      setPanel(null);
      await args.onRefresh();
    } finally {
      setBusy(null);
    }
  }, [args, cleanupMedia, currentSessionId, elapsedSeconds, joinedParticipants, sendSignal]);

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
    busy,
    errorMessage,
    elapsedSeconds,
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
