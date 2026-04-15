import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { deriveCanonicalCallSessionViewForViewer } from "@/lib/call/call-state";
import type { MessengerCallKind, MessengerCallStatus } from "./useCallStore";
import { useCallStore } from "./useCallStore";

/**
 * 서버 세션 → 공통 라이프사이클(`lib/call/call-state`) → Zustand `useCallStore`.
 */
export function mapSessionStatusToCallStoreStatus(
  session: CommunityMessengerCallSession | null,
  opts?: { hadTransportError?: boolean; viewerUserId?: string | null }
): MessengerCallStatus {
  if (!session) return "idle";
  if (opts?.hadTransportError) return "failed";
  const { lifecycle } = deriveCanonicalCallSessionViewForViewer(session, opts?.viewerUserId ?? null);
  switch (lifecycle) {
    case "idle":
      return "idle";
    case "calling":
      return "outgoing";
    case "ringing":
      return "incoming";
    case "accepted":
      return "active";
    case "declined":
      return "declined";
    case "canceled":
      return "canceled";
    case "missed":
      return "missed";
    case "ended":
      return "ended";
    default:
      return "idle";
  }
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
export function syncCallStoreFromSession(
  session: CommunityMessengerCallSession | null,
  opts?: { hadTransportError?: boolean; viewerUserId?: string | null }
) {
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
