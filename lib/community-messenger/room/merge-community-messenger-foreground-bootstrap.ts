import type {
  CommunityMessengerMessage,
  CommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/types";
import { mergeCommunityMessengerSilentDeltaIntoSnapshot } from "@/lib/community-messenger/room/merge-community-messenger-silent-delta";

function mergeMessageLists(
  prev: CommunityMessengerMessage[],
  next: CommunityMessengerMessage[]
): CommunityMessengerMessage[] {
  const byId = new Map<string, CommunityMessengerMessage>();
  for (const m of prev) byId.set(m.id, m);
  for (const m of next) {
    const existing = byId.get(m.id);
    byId.set(m.id, existing ? { ...existing, ...m } : m);
  }
  const merged = Array.from(byId.values());
  merged.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  });
  return merged;
}

function mergeMembers(
  prev: CommunityMessengerRoomSnapshot["members"],
  next: CommunityMessengerRoomSnapshot["members"]
): CommunityMessengerRoomSnapshot["members"] {
  if (!next?.length) return prev ?? [];
  if (!prev?.length) return next;
  const byId = new Map(prev.map((m) => [m.id, m]));
  for (const m of next) {
    const existing = byId.get(m.id);
    byId.set(m.id, existing ? { ...existing, ...m } : m);
  }
  return Array.from(byId.values());
}

function activeCallFingerprint(snap: CommunityMessengerRoomSnapshot): string {
  const ac = snap.activeCall;
  if (!ac) return "none";
  const participantSig =
    ac.participants?.map((p) => `${p.userId}:${p.status}`).join("|") ?? "";
  return `${ac.id}|${ac.status}|${participantSig}`;
}

/** 동일 타임라인·unread·통화 이면 setState no-op — FMV 직후 merge 비용·flash 방지 */
export function roomBootstrapTimelineFingerprint(snap: CommunityMessengerRoomSnapshot): string {
  const msgs = snap.messages ?? [];
  const tailId = msgs.length > 0 ? String(msgs[msgs.length - 1]?.id ?? "") : "";
  return `${msgs.length}|${tailId}|${snap.room.unreadCount ?? 0}|${(snap.room.lastMessage ?? "").slice(0, 48)}|${activeCallFingerprint(snap)}`;
}

function mergePendingFriendshipRequestId(
  prev: CommunityMessengerRoomSnapshot,
  next: CommunityMessengerRoomSnapshot
): string | undefined {
  if (
    next.friendshipDirection === "mutual_accepted" ||
    next.peerFriendshipState === "accepted" ||
    next.peerFriendshipState === "none" ||
    next.peerFriendshipState === "blocked"
  ) {
    return undefined;
  }
  return next.pendingFriendshipRequestId ?? prev.pendingFriendshipRequestId;
}

/**
 * 첫 진입 seed 스냅샷 위에 foreground bootstrap 을 single-pass 로 합친다.
 * 전체 교체·remount 유발 setState(snap) 대신 필드 단위 patch.
 */
export function mergeCommunityMessengerForegroundBootstrapIntoSnapshot(
  prev: CommunityMessengerRoomSnapshot,
  next: CommunityMessengerRoomSnapshot
): CommunityMessengerRoomSnapshot {
  const roomDeltaMerged = mergeCommunityMessengerSilentDeltaIntoSnapshot(prev, next);
  const { clientShellPlaceholder: _dropPlaceholder, ...roomCore } = roomDeltaMerged;
  void _dropPlaceholder;
  const prevMessages = prev.messages ?? [];
  const nextMessages = next.messages ?? [];
  const messages =
    nextMessages.length > 0 ? mergeMessageLists(prevMessages, nextMessages) : prevMessages;
  const members = mergeMembers(prev.members, next.members);
  const prevCount = prevMessages.length;
  const nextCount = nextMessages.length;
  return {
    ...roomCore,
    viewerUserId: next.viewerUserId || prev.viewerUserId,
    myRole: next.myRole ?? prev.myRole,
    members,
    messages,
    readReceipt: next.readReceipt ?? prev.readReceipt,
    peerPresence: next.peerPresence ?? prev.peerPresence,
    activeCall: Object.prototype.hasOwnProperty.call(next, "activeCall") ? next.activeCall : prev.activeCall,
    hasMoreOlderMessages:
      prevCount > nextCount && prevCount > 0
        ? prev.hasMoreOlderMessages
        : (next.hasMoreOlderMessages ?? prev.hasMoreOlderMessages),
    membersDeferred: next.membersDeferred ?? prev.membersDeferred,
    bootstrapEnrichmentPending:
      next.bootstrapEnrichmentPending ?? prev.bootstrapEnrichmentPending,
    peerFriendshipState: next.peerFriendshipState ?? prev.peerFriendshipState,
    friendshipDirection: next.friendshipDirection ?? prev.friendshipDirection,
    pendingFriendshipRequestId: mergePendingFriendshipRequestId(prev, next),
    peerRelationLabel: next.peerRelationLabel ?? prev.peerRelationLabel,
    directCallGate: next.directCallGate ?? prev.directCallGate,
    unknownPeerNoticeDismissed:
      next.unknownPeerNoticeDismissed ?? prev.unknownPeerNoticeDismissed,
  };
}
