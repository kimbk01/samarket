import type { CommunityMessengerCallSession, CommunityMessengerCallSessionStatus } from "@/lib/community-messenger/types";
import type { MessengerCallKind, MessengerCallStatus } from "./useCallStore";
import { useCallStore } from "./useCallStore";

/**
 * 서버 세션 상태 → Zustand `useCallStore` 용 UI 단계 (대략 매핑).
 * 실제 발신/수신 협상은 `useCommunityMessengerCall` 훅이 담당.
 */
export function mapSessionStatusToCallStoreStatus(
  session: CommunityMessengerCallSession | null,
  opts?: { hadTransportError?: boolean }
): MessengerCallStatus {
  if (!session) return "idle";
  if (opts?.hadTransportError) return "failed";
  const s: CommunityMessengerCallSessionStatus = session.status;
  if (s === "ringing") return session.isMineInitiator ? "outgoing" : "incoming";
  if (s === "active") return "active";
  if (s === "missed") return "missed";
  if (s === "rejected") return "declined";
  if (s === "cancelled") return "canceled";
  if (s === "ended") return "ended";
  return "idle";
}

export function peerFromSession(session: CommunityMessengerCallSession): {
  id: string;
  name: string;
  avatarUrl: string | null;
  roomId: string;
} {
  const id = session.peerUserId ?? session.initiatorUserId;
  return {
    id,
    name: session.peerLabel,
    avatarUrl: null,
    roomId: session.roomId,
  };
}

/** 세션 스냅샷을 받을 때 호출해 통화 스토어를 동기화 (선택). */
export function syncCallStoreFromSession(session: CommunityMessengerCallSession | null, opts?: { hadTransportError?: boolean }) {
  const status = mapSessionStatusToCallStoreStatus(session, opts);
  const callType: MessengerCallKind = session?.callKind === "video" ? "video" : "voice";
  if (!session) {
    useCallStore.getState().resetCall();
    return;
  }
  const peer = peerFromSession(session);
  useCallStore.setState({
    callType,
    callStatus: status,
    sessionId: session.id,
    peer,
    startedAt: session.answeredAt ?? session.startedAt,
    endedAt: session.endedAt,
  });
}
