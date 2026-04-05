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
import type {
  CommunityMessengerCallKind,
  CommunityMessengerCallSession,
  CommunityMessengerCallSignal,
} from "@/lib/community-messenger/types";

type CallPanelState = {
  kind: CommunityMessengerCallKind;
  mode: "dialing" | "incoming" | "connecting" | "active";
  sessionId: string | null;
  peerLabel: string;
};

type CallTransportState = "idle" | "connecting" | "connected" | "disconnected" | "failed";
type CallQuality = "good" | "normal" | "poor" | null;
type PendingIncomingAcceptance = {
  sessionId: string;
  peerUserId: string;
  peerLabel: string;
  callKind: CommunityMessengerCallKind;
};

const CALL_RING_TIMEOUT_MS = 35_000;
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

let cachedIceServers: RTCIceServer[] | null = null;
let cachedIceServersPromise: Promise<RTCIceServer[]> | null = null;
let cachedIceServersExpiresAt = 0;

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
  const sdp = typeof payload.sdp === "string" ? payload.sdp : "";
  if (!sdp) return null;
  return { type: expectedType, sdp };
}

function hasRelayIceServer(servers: RTCIceServer[]): boolean {
  return servers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((value) => typeof value === "string" && /^turns?:/i.test(value));
  });
}

async function getCommunityMessengerIceServers(): Promise<RTCIceServer[]> {
  if (cachedIceServers && cachedIceServersExpiresAt > Date.now()) return cachedIceServers;
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
        cachedIceServersExpiresAt = Date.now() + 10_000;
        return cachedIceServers;
      }
      cachedIceServers = json.iceServers;
      cachedIceServersExpiresAt = Date.now() + (hasRelayIceServer(json.iceServers) ? 5 * 60_000 : 60_000);
      return cachedIceServers;
    })
    .catch(() => {
      cachedIceServers = DEFAULT_ICE_SERVERS;
      cachedIceServersExpiresAt = Date.now() + 10_000;
      return cachedIceServers;
    })
    .finally(() => {
      cachedIceServersPromise = null;
    });
  return cachedIceServersPromise;
}

export function useCommunityMessengerCall(args: {
  roomId: string;
  roomType: "direct" | "group";
  viewerUserId: string;
  peerUserId: string | null;
  peerLabel: string;
  activeCall: CommunityMessengerCallSession | null;
  onRefresh: () => Promise<void> | void;
}) {
  const [panel, setPanel] = useState<CallPanelState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [transportState, setTransportState] = useState<CallTransportState>("idle");
  const [callQuality, setCallQuality] = useState<CallQuality>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingIncomingAcceptanceRef = useRef<PendingIncomingAcceptance | null>(null);
  const processedSignalIdsRef = useRef<Set<string>>(new Set());
  const activeSinceRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const sessionCleanupTimerRef = useRef<number | null>(null);
  const autoRetryTimerRef = useRef<number | null>(null);
  const autoRetryAttemptRef = useRef(0);
  const locallyClosedSessionIdRef = useRef<string | null>(null);
  const pendingCallActionIdRef = useRef(0);

  const currentSessionId = panel?.sessionId ?? args.activeCall?.id ?? null;

  const clearPendingSessionCleanup = useCallback(() => {
    if (sessionCleanupTimerRef.current === null) return;
    window.clearTimeout(sessionCleanupTimerRef.current);
    sessionCleanupTimerRef.current = null;
  }, []);

  const clearPendingAutoRetry = useCallback(() => {
    if (autoRetryTimerRef.current === null) return;
    window.clearTimeout(autoRetryTimerRef.current);
    autoRetryTimerRef.current = null;
  }, []);

  const invalidatePendingCallActions = useCallback(() => {
    pendingCallActionIdRef.current += 1;
  }, []);

  const cleanupMedia = useCallback(() => {
    clearPendingSessionCleanup();
    clearPendingAutoRetry();
    invalidatePendingCallActions();
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    for (const track of localStream?.getTracks() ?? []) track.stop();
    for (const track of remoteStream?.getTracks() ?? []) track.stop();
    discardPrimedCommunityMessengerDevicePermission();
    setLocalStream(null);
    setRemoteStream(null);
    pendingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    pendingIncomingAcceptanceRef.current = null;
    processedSignalIdsRef.current.clear();
    activeSinceRef.current = null;
    autoRetryAttemptRef.current = 0;
    setElapsedSeconds(0);
    setTransportState("idle");
    setCallQuality(null);
  }, [clearPendingAutoRetry, clearPendingSessionCleanup, invalidatePendingCallActions, localStream, remoteStream]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearPendingSessionCleanup();
      clearPendingAutoRetry();
      cleanupMedia();
    };
  }, [cleanupMedia, clearPendingAutoRetry, clearPendingSessionCleanup]);

  useEffect(() => {
    const node = localVideoRef.current;
    if (!node) return;
    bindMediaStreamToElement(node, localStream, { muted: true });
    return () => {
      node.srcObject = null;
    };
  }, [localStream]);

  useEffect(() => {
    const node = remoteVideoRef.current;
    if (!node) return;
    bindMediaStreamToElement(node, remoteStream);
    return () => {
      node.srcObject = null;
    };
  }, [remoteStream]);

  useEffect(() => {
    const node = remoteAudioRef.current;
    if (!node) return;
    bindMediaStreamToElement(node, remoteStream);
    return () => {
      node.srcObject = null;
    };
  }, [remoteStream]);

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
    const activeCall = args.activeCall;
    if (!activeCall) {
      if (panel?.sessionId) {
        if (locallyClosedSessionIdRef.current === panel.sessionId) {
          locallyClosedSessionIdRef.current = null;
          cleanupMedia();
          setPanel(null);
          return;
        }
        clearPendingSessionCleanup();
        sessionCleanupTimerRef.current = window.setTimeout(() => {
          cleanupMedia();
          setPanel(null);
          sessionCleanupTimerRef.current = null;
        }, 350);
      }
      return;
    }

    if (locallyClosedSessionIdRef.current === activeCall.id) {
      return;
    }
    locallyClosedSessionIdRef.current = null;
    clearPendingSessionCleanup();

    if (activeCall.status === "ringing") {
      setPanel((prev) => {
        if (prev?.sessionId === activeCall.id && (prev.mode === "connecting" || prev.mode === "active")) return prev;
        return {
          kind: activeCall.callKind,
          mode: activeCall.isMineInitiator ? "dialing" : "incoming",
          sessionId: activeCall.id,
          peerLabel: activeCall.peerLabel,
        };
      });
      return;
    }

    if (activeCall.status === "active") {
      activeSinceRef.current = new Date(activeCall.answeredAt ?? activeCall.startedAt).getTime();
      setPanel({
        kind: activeCall.callKind,
        mode: transportState === "connected" ? "active" : "connecting",
        sessionId: activeCall.id,
        peerLabel: activeCall.peerLabel,
      });
    }
  }, [args.activeCall, cleanupMedia, clearPendingSessionCleanup, panel?.sessionId, transportState]);

  const ensureLocalStream = useCallback(async (kind: CommunityMessengerCallKind) => {
    if (localStream) return localStream;
    const primedStream = consumePrimedCommunityMessengerDevicePermission(kind);
    if (primedStream) {
      if (!mountedRef.current) {
        for (const track of primedStream.getTracks()) track.stop();
        throw new Error("unmounted");
      }
      setLocalStream(primedStream);
      return primedStream;
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
  }, [localStream]);

  const sendSignal = useCallback(async (sessionId: string, toUserId: string, signalType: "offer" | "answer" | "ice-candidate" | "hangup", payload: Record<string, unknown>) => {
    const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}/signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId, signalType, payload }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      throw new Error(json.error ?? `${signalType}_signal_failed`);
    }
  }, []);

  useEffect(() => {
    if (!args.activeCall || args.activeCall.status !== "ringing" || !args.activeCall.isMineInitiator) return;
    const sessionId = args.activeCall.id;
    const peerUserId = args.activeCall.peerUserId;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          if (peerUserId) {
            await sendSignal(sessionId, peerUserId, "hangup", { reason: "missed" });
          }
          await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "missed" }),
          });
          cleanupMedia();
          setPanel(null);
          setErrorMessage("상대방이 받지 않아 부재중 통화로 처리되었습니다.");
          await args.onRefresh();
        } catch {
          /* ignore timeout failure */
        }
      })();
    }, CALL_RING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [args, cleanupMedia, sendSignal]);

  const flushPendingCandidates = useCallback(async () => {
    const connection = peerConnectionRef.current;
    if (!connection || !connection.remoteDescription) return;
    for (const candidate of pendingCandidatesRef.current.splice(0)) {
      try {
        await connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        /* ignore candidate failures */
      }
    }
  }, []);

  const ensurePeerConnection = useCallback(
    async (kind: CommunityMessengerCallKind, sessionId: string, peerUserId: string) => {
      const existing = peerConnectionRef.current;
      if (existing) return existing;
      const stream = await ensureLocalStream(kind);
      const iceServers = await getCommunityMessengerIceServers();
      const connection = new RTCPeerConnection({
        iceServers,
        bundlePolicy: "max-bundle",
        iceCandidatePoolSize: 4,
      });
      setTransportState("connecting");
      const nextRemoteStream = new MediaStream();
      setRemoteStream(nextRemoteStream);
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
        bindMediaStreamToElement(remoteVideoRef.current, nextRemoteStream);
        bindMediaStreamToElement(remoteAudioRef.current, nextRemoteStream);
      };
      connection.onicecandidate = (event) => {
        if (!event.candidate) return;
        void sendSignal(sessionId, peerUserId, "ice-candidate", {
          candidate: event.candidate.toJSON(),
        }).catch(() => {
          /* ignore transient ICE signal delivery failure */
        });
      };
      connection.onconnectionstatechange = () => {
        const state = connection.connectionState;
        if (state === "connected") {
          clearPendingAutoRetry();
          autoRetryAttemptRef.current = 0;
          setTransportState("connected");
          setPanel((prev) =>
            prev && prev.sessionId === sessionId ? { ...prev, mode: "active" } : prev
          );
          return;
        }
        if (state === "connecting" || state === "new") {
          setTransportState("connecting");
          setPanel((prev) =>
            prev && prev.sessionId === sessionId && prev.mode !== "incoming" ? { ...prev, mode: "connecting" } : prev
          );
          return;
        }
        if (state === "disconnected") {
          setTransportState("disconnected");
          setErrorMessage("네트워크가 잠시 불안정합니다. 자동으로 다시 연결합니다.");
          return;
        }
        if (state === "failed") {
          setTransportState("failed");
          setErrorMessage("통화 연결이 약해 자동 복구를 시도합니다.");
          return;
        }
        if (state === "closed") {
          setTransportState("idle");
        }
      };
      connection.oniceconnectionstatechange = () => {
        const state = connection.iceConnectionState;
        if (state === "connected" || state === "completed") {
          clearPendingAutoRetry();
          autoRetryAttemptRef.current = 0;
          setTransportState("connected");
          setPanel((prev) =>
            prev && prev.sessionId === sessionId ? { ...prev, mode: "active" } : prev
          );
          return;
        }
        if (state === "checking" || state === "new") {
          setTransportState("connecting");
          setPanel((prev) =>
            prev && prev.sessionId === sessionId && prev.mode !== "incoming" ? { ...prev, mode: "connecting" } : prev
          );
          return;
        }
        if (state === "disconnected") {
          setTransportState("disconnected");
          return;
        }
        if (state === "failed") {
          setTransportState("failed");
        }
      };
      peerConnectionRef.current = connection;
      return connection;
    },
    [clearPendingAutoRetry, ensureLocalStream, sendSignal]
  );

  const completeIncomingAcceptance = useCallback(
    async (pending: PendingIncomingAcceptance, offer: RTCSessionDescriptionInit) => {
      const connection = await ensurePeerConnection(pending.callKind, pending.sessionId, pending.peerUserId);
      await connection.setRemoteDescription(offer);
      await flushPendingCandidates();
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await sendSignal(pending.sessionId, pending.peerUserId, "answer", { sdp: answer.sdp ?? "" });
      const acceptRes = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(pending.sessionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      const acceptJson = (await acceptRes.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!acceptRes.ok || !acceptJson.ok) {
        throw new Error(acceptJson.error ?? "call_accept_failed");
      }
      pendingOfferRef.current = null;
      pendingIncomingAcceptanceRef.current = null;
      activeSinceRef.current = Date.now();
      setErrorMessage(null);
      setTransportState("connecting");
      setPanel({
        kind: pending.callKind,
        mode: "connecting",
        sessionId: pending.sessionId,
        peerLabel: pending.peerLabel,
      });
      await args.onRefresh();
    },
    [args, ensurePeerConnection, flushPendingCandidates, sendSignal]
  );

  const applySignal = useCallback(
    async (signal: CommunityMessengerCallSignal) => {
      if (signal.toUserId !== args.viewerUserId) return;
      if (processedSignalIdsRef.current.has(signal.id)) return;
      processedSignalIdsRef.current.add(signal.id);

      if (signal.signalType === "offer") {
        const offer = readSessionDescription(signal.payload, "offer");
        if (!offer) return;
        if (peerConnectionRef.current && panel?.mode === "active" && args.peerUserId) {
          await peerConnectionRef.current.setRemoteDescription(offer);
          await flushPendingCandidates();
          const answer = await peerConnectionRef.current.createAnswer();
          await peerConnectionRef.current.setLocalDescription(answer);
          await sendSignal(signal.sessionId, args.peerUserId, "answer", { sdp: answer.sdp ?? "" });
          return;
        }
        pendingOfferRef.current = offer;
        const pendingAcceptance = pendingIncomingAcceptanceRef.current;
        if (pendingAcceptance && pendingAcceptance.sessionId === signal.sessionId && pendingAcceptance.peerUserId === signal.fromUserId) {
          await completeIncomingAcceptance(pendingAcceptance, offer);
        }
        return;
      }

      if (signal.signalType === "answer") {
        const answer = readSessionDescription(signal.payload, "answer");
        if (!answer || !peerConnectionRef.current) return;
        if (!peerConnectionRef.current.currentRemoteDescription) {
          await peerConnectionRef.current.setRemoteDescription(answer);
          await flushPendingCandidates();
        }
        return;
      }

      if (signal.signalType === "ice-candidate") {
        const candidate = readCandidateInit(signal.payload);
        if (!candidate) return;
        if (!peerConnectionRef.current?.remoteDescription) {
          pendingCandidatesRef.current.push(candidate);
          return;
        }
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          /* ignore candidate failures */
        }
        return;
      }

      if (signal.signalType === "hangup") {
        cleanupMedia();
        setPanel(null);
        setErrorMessage("상대방이 통화를 종료했습니다.");
        await args.onRefresh();
      }
    },
    [args, cleanupMedia, completeIncomingAcceptance, flushPendingCandidates, panel?.mode, sendSignal]
  );

  useEffect(() => {
    if (panel?.mode !== "active") return;
    const connection = peerConnectionRef.current;
    if (!connection) return;
    let cancelled = false;

    const timer = setInterval(() => {
      void (async () => {
        try {
          const stats = await connection.getStats();
          let nextQuality: CallQuality = null;
          stats.forEach((report) => {
            if (report.type !== "candidate-pair") return;
            const selected = (report as RTCStats & { nominated?: boolean; state?: string }).state === "succeeded";
            if (!selected) return;
            const rtt = Number((report as RTCStats & { currentRoundTripTime?: number }).currentRoundTripTime ?? 0);
            if (!rtt) {
              nextQuality = "normal";
              return;
            }
            if (rtt < 0.15) nextQuality = "good";
            else if (rtt < 0.35) nextQuality = "normal";
            else nextQuality = "poor";
          });
          if (!cancelled) setCallQuality(nextQuality);
        } catch {
          /* ignore stats polling failure */
        }
      })();
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [panel?.mode, transportState]);

  useEffect(() => {
    if (!panel?.sessionId) return;
    if (panel.mode === "active" && transportState === "connected") return;
    let cancelled = false;
    const refreshNow = () => {
      if (cancelled) return;
      void args.onRefresh();
    };
    refreshNow();
    const timer = window.setInterval(refreshNow, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [args, panel?.mode, panel?.sessionId, transportState]);

  // Realtime 이 없거나 초기 GET 이 레이스로 비었을 때 offer/answer/ICE 가 빠져 연결이 멈추는 것을 막는다.
  useEffect(() => {
    const sessionId = currentSessionId;
    if (!sessionId || !panel || transportState === "connected") return;

    const needsSignalPoll =
      panel.mode === "dialing" ||
      panel.mode === "connecting" ||
      (panel.mode === "incoming" && args.activeCall?.status === "ringing") ||
      panel.mode === "active";

    if (!needsSignalPoll) return;

    const pollSessionId = sessionId;
    let cancelled = false;

    async function pollSignals() {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(pollSessionId)}/signals`, {
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
  }, [
    applySignal,
    args.activeCall?.status,
    currentSessionId,
    panel?.mode,
    panel?.sessionId,
    transportState,
  ]);

  useEffect(() => {
    if (!currentSessionId) return;
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
        .channel(`community-messenger-call-signals:${sessionId}:${args.viewerUserId}`)
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
  }, [applySignal, args.viewerUserId, currentSessionId]);

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
    invalidatePendingCallActions();
    cleanupMedia();
    setPanel(null);
    setErrorMessage(null);
  }, [cleanupMedia, invalidatePendingCallActions]);

  const closeSessionImmediately = useCallback(
    (sessionId: string | null) => {
      invalidatePendingCallActions();
      if (sessionId) {
        locallyClosedSessionIdRef.current = sessionId;
      }
      cleanupMedia();
      setPanel(null);
      setErrorMessage(null);
    },
    [cleanupMedia, invalidatePendingCallActions]
  );

  const startOutgoingCall = useCallback(async (kind: CommunityMessengerCallKind) => {
    if (!args.peerUserId) return;
    const actionId = pendingCallActionIdRef.current + 1;
    pendingCallActionIdRef.current = actionId;
    setBusy("call-start");
    setErrorMessage(null);
    setPanel({
      kind,
      mode: "dialing",
      sessionId: null,
      peerLabel: args.peerLabel,
    });
    try {
      await ensureLocalStream(kind);
      if (pendingCallActionIdRef.current !== actionId) return;
      const res = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(args.roomId)}/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callKind: kind }),
      });
      if (pendingCallActionIdRef.current !== actionId) return;
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; session?: CommunityMessengerCallSession };
      if (!res.ok || !json.ok || !json.session) {
        setErrorMessage(
          json.error === "group_call_not_supported_yet"
            ? "그룹 통화 실연결은 다음 단계에서 지원합니다."
            : "통화 시작에 실패했습니다."
        );
        return;
      }
      const session = json.session;
      if (!session.peerUserId) {
        setErrorMessage("상대방 정보를 불러오지 못했습니다.");
        return;
      }
      if (pendingCallActionIdRef.current !== actionId) return;
      setPanel({
        kind: session.callKind,
        mode: "dialing",
        sessionId: session.id,
        peerLabel: session.peerLabel,
      });
      const connection = await ensurePeerConnection(session.callKind, session.id, session.peerUserId);
      if (pendingCallActionIdRef.current !== actionId) return;
      const offer = await connection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: session.callKind === "video",
      });
      await connection.setLocalDescription(offer);
      if (pendingCallActionIdRef.current !== actionId) return;
      await sendSignal(session.id, session.peerUserId, "offer", { sdp: offer.sdp ?? "" });
      await args.onRefresh();
    } catch (error) {
      const errorName =
        typeof error === "object" && error && "name" in error
          ? String((error as { name?: unknown }).name ?? "")
          : "";
      setErrorMessage(errorName ? getCommunityMessengerMediaErrorMessage(error, kind) : "통화 연결을 시작하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }, [args, ensureLocalStream, ensurePeerConnection, sendSignal]);

  const rejectIncomingCall = useCallback(async () => {
    if (!args.activeCall?.id) return;
    const sessionId = args.activeCall.id;
    setBusy("call-reject");
    closeSessionImmediately(sessionId);
    try {
      await Promise.allSettled([
        fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reject" }),
        }),
        args.peerUserId ? sendSignal(sessionId, args.peerUserId, "hangup", { reason: "reject" }) : Promise.resolve(),
      ]);
      await args.onRefresh();
    } finally {
      setBusy(null);
    }
  }, [args, closeSessionImmediately, sendSignal]);

  const acceptIncomingCall = useCallback(async () => {
    const activeCall = args.activeCall;
    if (!activeCall) return;
    setBusy("call-accept");
    setErrorMessage(null);
    try {
      if (!activeCall.peerUserId) {
        setErrorMessage("상대방 정보를 불러오지 못했습니다.");
        return;
      }
      pendingIncomingAcceptanceRef.current = {
        sessionId: activeCall.id,
        peerUserId: activeCall.peerUserId,
        peerLabel: activeCall.peerLabel,
        callKind: activeCall.callKind,
      };
      await ensurePeerConnection(activeCall.callKind, activeCall.id, activeCall.peerUserId);
      setTransportState("connecting");
      setPanel({
        kind: activeCall.callKind,
        mode: "connecting",
        sessionId: activeCall.id,
        peerLabel: activeCall.peerLabel,
      });
      const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(activeCall.id)}/signals`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; signals?: CommunityMessengerCallSignal[] };
      for (const signal of json.signals ?? []) {
        await applySignal(signal);
      }
      const pendingAcceptance = pendingIncomingAcceptanceRef.current;
      if (!pendingAcceptance || pendingAcceptance.sessionId !== activeCall.id) {
        return;
      }
      const offer = pendingOfferRef.current;
      if (!offer) {
        return;
      }
      await completeIncomingAcceptance(
        pendingAcceptance,
        offer
      );
    } catch (error) {
      const errorName =
        typeof error === "object" && error && "name" in error
          ? String((error as { name?: unknown }).name ?? "")
          : "";
      setErrorMessage(
        error instanceof Error && error.message === "unmounted"
          ? "통화 화면을 다시 열어 주세요."
          : errorName
            ? getCommunityMessengerMediaErrorMessage(error, activeCall.callKind)
            : "통화 연결을 시작하지 못했습니다."
      );
      pendingIncomingAcceptanceRef.current = null;
    } finally {
      setBusy(null);
    }
  }, [applySignal, args, completeIncomingAcceptance, ensurePeerConnection]);

  const cancelOutgoingCall = useCallback(async () => {
    const sessionId = currentSessionId;
    if (!sessionId || !args.peerUserId) return;
    setBusy("call-cancel");
    closeSessionImmediately(sessionId);
    try {
      await Promise.allSettled([
        sendSignal(sessionId, args.peerUserId, "hangup", { reason: "cancel" }),
        fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cancel" }),
        }),
      ]);
      await args.onRefresh();
    } finally {
      setBusy(null);
    }
  }, [args.onRefresh, args.peerUserId, closeSessionImmediately, currentSessionId, sendSignal]);

  const endActiveCall = useCallback(async () => {
    const sessionId = currentSessionId;
    if (!sessionId || !args.peerUserId) return;
    setBusy("call-end");
    closeSessionImmediately(sessionId);
    try {
      await Promise.allSettled([
        sendSignal(sessionId, args.peerUserId, "hangup", { reason: "end" }),
        fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "end",
            durationSeconds: elapsedSeconds,
          }),
        }),
      ]);
      await args.onRefresh();
    } finally {
      setBusy(null);
    }
  }, [args.onRefresh, args.peerUserId, closeSessionImmediately, currentSessionId, elapsedSeconds, sendSignal]);

  const retryConnection = useCallback(async () => {
    const sessionId = currentSessionId;
    const connection = peerConnectionRef.current;
    if (!sessionId || !connection || !args.peerUserId || !panel) return;
    setBusy("call-retry");
    setErrorMessage("네트워크 복구를 시도하고 있습니다.");
    setTransportState("connecting");
    try {
      const offer = await connection.createOffer({
        iceRestart: true,
        offerToReceiveAudio: true,
        offerToReceiveVideo: panel.kind === "video",
      });
      await connection.setLocalDescription(offer);
      await sendSignal(sessionId, args.peerUserId, "offer", { sdp: offer.sdp ?? "" });
    } finally {
      setBusy(null);
    }
  }, [args.peerUserId, currentSessionId, panel, sendSignal]);

  useEffect(() => {
    if (!panel?.sessionId) {
      clearPendingAutoRetry();
      autoRetryAttemptRef.current = 0;
      return;
    }
    if (panel.mode === "incoming") {
      clearPendingAutoRetry();
      return;
    }
    if (transportState === "connected") {
      clearPendingAutoRetry();
      autoRetryAttemptRef.current = 0;
      return;
    }
    if ((transportState !== "disconnected" && transportState !== "failed") || busy === "call-retry") {
      clearPendingAutoRetry();
      return;
    }
    if (autoRetryAttemptRef.current >= 2) return;
    clearPendingAutoRetry();
    autoRetryTimerRef.current = window.setTimeout(() => {
      autoRetryTimerRef.current = null;
      autoRetryAttemptRef.current += 1;
      void retryConnection();
    }, transportState === "failed" ? 400 : 1200);
    return () => {
      clearPendingAutoRetry();
    };
  }, [busy, clearPendingAutoRetry, panel?.mode, panel?.sessionId, retryConnection, transportState]);

  const callStatusLabel = useMemo(() => {
    if (!panel) return "";
    if (panel.mode === "dialing") return "상대방에게 거는 중";
    if (panel.mode === "incoming") return "수신 전화";
    if (panel.mode === "connecting") return "연결 중";
    return "통화 진행 중";
  }, [panel]);

  const connectionBadge = useMemo(() => {
    if (transportState === "connected") {
      if (callQuality === "good") return { label: "연결 좋음", tone: "good" as const };
      if (callQuality === "poor") return { label: "연결 약함", tone: "poor" as const };
      return { label: "연결 안정", tone: "normal" as const };
    }
    if (transportState === "connecting") return { label: "연결 중", tone: "normal" as const };
    if (transportState === "disconnected") return { label: "끊김 감지", tone: "poor" as const };
    if (transportState === "failed") return { label: "연결 실패", tone: "poor" as const };
    return null;
  }, [callQuality, transportState]);

  return {
    panel,
    busy,
    errorMessage,
    elapsedSeconds,
    localStream,
    remoteStream,
    localVideoRef,
    remoteVideoRef,
    remoteAudioRef,
    callStatusLabel,
    connectionBadge,
    prepareDevices,
    dismissPanel,
    closeSessionImmediately,
    startOutgoingCall,
    acceptIncomingCall,
    rejectIncomingCall,
    cancelOutgoingCall,
    endActiveCall,
    retryConnection,
  };
}
