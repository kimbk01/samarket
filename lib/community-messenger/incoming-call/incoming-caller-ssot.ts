/**
 * 수신 1:1 통화 — 발신자(caller) SSOT.
 * 카톡/텔레그램: 힌트(broadcast·FCM)는 sessionId·callerUserId 만, 표시는 callerUserId → 프로필 1경로.
 */
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

export type IncomingCallerDisplay = {
  label: string;
  avatarUrl: string | null;
  publicId: string | null;
};

/** `회원 abc123` 등 — UI에 노출 금지, resolve 대기 */
export function isIncomingCallerDisplayFallback(label: string, callerUserId: string): boolean {
  const trimmed = label.trim();
  if (!trimmed) return true;
  if (/^회원(\s|$)/u.test(trimmed)) return true;
  if (/^member(\s|$)/iu.test(trimmed)) return true;
  const compact = callerUserId.replace(/-/g, "").slice(0, 6).toLowerCase();
  if (!compact) return false;
  return trimmed.toLowerCase().includes(compact) && (/^회원\s/u.test(trimmed) || /^member\s/iu.test(trimmed));
}

/**
 * 수신 UI에 쓸 발신자 user id.
 * direct 수신(callee) → initiatorUserId 고정. peerUserId·participants 라벨은 신뢰하지 않는다.
 */
export function resolveDirectIncomingCallerUserId(
  session: CommunityMessengerCallSession,
  viewerUserId: string
): string | null {
  const viewer = viewerUserId.trim();
  if (!viewer) return null;
  if (session.sessionMode !== "direct") {
    return session.peerUserId?.trim() || null;
  }
  const initiator = session.initiatorUserId?.trim() ?? "";
  const recipient = session.recipientUserId?.trim() ?? "";
  if (!initiator) return null;
  if (recipient && messengerUserIdsEqual(recipient, viewer)) {
    return initiator;
  }
  if (messengerUserIdsEqual(initiator, viewer)) {
    return recipient || null;
  }
  return initiator;
}

/** GET 스냅샷 seed — peerUserId 가 caller 와 일치할 때만 사용 */
export function readIncomingCallerDisplaySeed(
  session: CommunityMessengerCallSession,
  callerUserId: string
): IncomingCallerDisplay | null {
  const caller = callerUserId.trim();
  if (!caller) return null;
  if (session.peerUserId?.trim() !== caller) return null;
  const label = session.peerLabel?.trim() ?? "";
  if (!label || isIncomingCallerDisplayFallback(label, caller)) return null;
  return {
    label,
    avatarUrl: session.peerAvatarUrl?.trim() || null,
    publicId: session.peerPublicId?.trim().replace(/^@+/, "") || null,
  };
}
