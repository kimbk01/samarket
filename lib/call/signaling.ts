/**
 * Samarket Messenger 통화 시그널링 — 서버는 `community_messenger_call_signals` + REST POST.
 * 논리 이벤트 이름과 실제 저장 타입을 분리해 상위 레이어에서 읽기 쉽게 한다.
 */

import type { CommunityMessengerCallSignalType } from "@/lib/community-messenger/types";

/** DB/API 에 실제로 저장되는 WebRTC 시그널 */
export type WireWebRtcSignalType = CommunityMessengerCallSignalType;

/** 상위 설계 문서용 논리 이름 (REST 세션 생성 = call_invite 에 해당) */
export type LogicalCallSignal =
  | "call_invite"
  | "call_accept"
  | "call_decline"
  | "call_cancel"
  | "call_end"
  | "webrtc_offer"
  | "webrtc_answer"
  | "webrtc_ice_candidate";

export type SessionSignalPayload = {
  roomId: string;
  callerId: string;
  calleeId: string;
  callType: "voice" | "video";
  timestamp: string;
  sdp?: string;
  candidate?: RTCIceCandidateInit;
};

export function logicalToWire(type: LogicalCallSignal): WireWebRtcSignalType | null {
  switch (type) {
    case "webrtc_offer":
      return "offer";
    case "webrtc_answer":
      return "answer";
    case "webrtc_ice_candidate":
      return "ice-candidate";
    case "call_end":
    case "call_decline":
    case "call_cancel":
      return "hangup";
    default:
      return null;
  }
}

export function wireToLogical(type: WireWebRtcSignalType, payload: Record<string, unknown>): LogicalCallSignal {
  if (type === "offer") return "webrtc_offer";
  if (type === "answer") return "webrtc_answer";
  if (type === "ice-candidate") return "webrtc_ice_candidate";
  const reason = typeof payload.reason === "string" ? payload.reason : "";
  if (reason === "reject") return "call_decline";
  return "call_end";
}

export type SendWebRtcSignalArgs = {
  sessionId: string;
  toUserId: string;
  signalType: WireWebRtcSignalType;
  payload: Record<string, unknown>;
};

/** Supabase에 기록되는 동일 페이로드를 REST 로 전송 */
export async function sendWebRtcSessionSignal(args: SendWebRtcSignalArgs): Promise<void> {
  const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(args.sessionId)}/signals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      toUserId: args.toUserId,
      signalType: args.signalType,
      payload: args.payload,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? "signal_send_failed");
  }
}
