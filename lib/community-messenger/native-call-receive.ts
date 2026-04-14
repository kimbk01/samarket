"use client";

import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage?: (message: string) => void;
    };
    communityMessengerNativeIncomingCallBridge?: {
      postIncomingCall?: (payload: CommunityMessengerNativeIncomingCallPayload) => void;
      clearIncomingCall?: (sessionId: string) => void;
    };
  }
}

export type CommunityMessengerNativeIncomingCallPayload = {
  sessionId: string;
  roomId: string;
  peerUserId: string | null;
  peerLabel: string;
  callKind: "voice" | "video";
  startedAt: string;
  acceptUrl: string;
  rejectUrl: string;
  fallbackUrl: string;
};

export type CommunityMessengerIncomingCallBridgeStatus = {
  mode: "native_bridge" | "react_native_webview" | "web_only";
  label: string;
  supportsBackgroundParity: boolean;
};

export function getCommunityMessengerIncomingCallBridgeStatus(): CommunityMessengerIncomingCallBridgeStatus {
  if (typeof window === "undefined") {
    return {
      mode: "web_only",
      label: "웹 레이어",
      supportsBackgroundParity: false,
    };
  }
  if (window.communityMessengerNativeIncomingCallBridge?.postIncomingCall) {
    return {
      mode: "native_bridge",
      label: "앱 브리지 연결됨",
      supportsBackgroundParity: true,
    };
  }
  if (window.ReactNativeWebView?.postMessage) {
    return {
      mode: "react_native_webview",
      label: "웹뷰 브리지 대기",
      supportsBackgroundParity: true,
    };
  }
  return {
    mode: "web_only",
    label: "브라우저 인앱 수신",
    supportsBackgroundParity: false,
  };
}

export function buildCommunityMessengerNativeIncomingCallPayload(
  session: CommunityMessengerCallSession
): CommunityMessengerNativeIncomingCallPayload {
  return {
    sessionId: session.id,
    roomId: session.roomId,
    peerUserId: session.peerUserId ?? null,
    peerLabel: session.peerLabel,
    callKind: session.callKind,
    startedAt: session.startedAt,
    acceptUrl:
      session.sessionMode === "group"
        ? `/community-messenger/rooms/${encodeURIComponent(session.roomId)}?callAction=accept&sessionId=${encodeURIComponent(session.id)}`
        : `/community-messenger/calls/${encodeURIComponent(session.id)}?action=accept`,
    rejectUrl: `/api/community-messenger/calls/sessions/${encodeURIComponent(session.id)}`,
    fallbackUrl: `/community-messenger/calls/${encodeURIComponent(session.id)}`,
  };
}

export function syncCommunityMessengerNativeIncomingCall(session: CommunityMessengerCallSession | null) {
  if (typeof window === "undefined") return;
  const bridge = window.communityMessengerNativeIncomingCallBridge;

  if (!session || session.status !== "ringing") {
    const sessionId = session?.id ?? "";
    if (sessionId && bridge?.clearIncomingCall) {
      bridge.clearIncomingCall(sessionId);
    }
    if (window.ReactNativeWebView?.postMessage && sessionId) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "community_messenger_incoming_call_clear",
          sessionId,
        })
      );
    }
    return;
  }

  const payload = buildCommunityMessengerNativeIncomingCallPayload(session);
  if (bridge?.postIncomingCall) {
    bridge.postIncomingCall(payload);
    return;
  }
  if (window.ReactNativeWebView?.postMessage) {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({
        type: "community_messenger_incoming_call",
        payload,
      })
    );
  }
}
