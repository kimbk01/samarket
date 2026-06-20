import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { peekHotRoomSnapshot, peekRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import { isMessengerRoomTimelineBootstrapSeedComplete } from "@/lib/community-messenger/room/messenger-room-timeline-hydration";

function messageCount(snap: CommunityMessengerRoomSnapshot | null | undefined): number {
  return snap?.messages?.length ?? 0;
}

/** BootstrapGate·IndexedDB·foreground lock 재사용 가능한 실스냅샷(클라 셸 placeholder 제외) */
export function isMessengerRoomBootstrapReadySnapshot(
  snap: CommunityMessengerRoomSnapshot | null | undefined
): snap is CommunityMessengerRoomSnapshot {
  return Boolean(snap && !snap.clientShellPlaceholder);
}

/** lastMessage 없음 + messages[] 비어 있음 — 진짜 빈 방만 authoritative empty 로 인정 */
export function isMessengerRoomConfirmedEmptySnapshot(
  snapshot:
    | {
        messages?: CommunityMessengerRoomSnapshot["messages"];
        room: Pick<CommunityMessengerRoomSnapshot["room"], "lastMessage">;
        clientShellPlaceholder?: boolean;
      }
    | null
    | undefined
): boolean {
  if (!snapshot || snapshot.clientShellPlaceholder) return false;
  if (Boolean(snapshot.room.lastMessage?.trim())) return false;
  return (snapshot.messages?.length ?? 0) === 0;
}

/** RoomClient 첫 mount·paint SSOT — complete bootstrap seed 또는 confirmed empty 만 */
export function isAuthoritativeMessengerRoomEntrySnapshot(
  snapshot: CommunityMessengerRoomSnapshot | null | undefined
): snapshot is CommunityMessengerRoomSnapshot {
  if (!isMessengerRoomBootstrapReadySnapshot(snapshot)) return false;
  return (
    isMessengerRoomTimelineBootstrapSeedComplete(snapshot) ||
    isMessengerRoomConfirmedEmptySnapshot(snapshot)
  );
}

function isAuthoritativeRoomSnapshotCandidate(
  snapshot: CommunityMessengerRoomSnapshot | null | undefined
): snapshot is CommunityMessengerRoomSnapshot {
  return isAuthoritativeMessengerRoomEntrySnapshot(snapshot);
}

/**
 * complete seed 또는 confirmed empty 후보만 pool — lastMessage-only incomplete 는 authoritative 금지.
 */
export function pickRichestAuthoritativeRoomSnapshot(
  server: CommunityMessengerRoomSnapshot | null,
  ...others: Array<CommunityMessengerRoomSnapshot | null | undefined>
): CommunityMessengerRoomSnapshot | null {
  const candidates: CommunityMessengerRoomSnapshot[] = [];
  if (server && isAuthoritativeRoomSnapshotCandidate(server)) candidates.push(server);
  for (const candidate of others) {
    if (isAuthoritativeRoomSnapshotCandidate(candidate)) candidates.push(candidate);
  }
  if (candidates.length === 0) return null;

  let best = candidates[0] ?? null;
  let bestCount = messageCount(best);
  for (const candidate of candidates.slice(1)) {
    const n = messageCount(candidate);
    if (n > bestCount) {
      best = candidate;
      bestCount = n;
    }
  }
  return best;
}

export type PickAuthoritativeMessengerRoomSnapshotInput = {
  roomId: string;
  viewerUserId: string;
  /** BootstrapGate·주문 슬라이드·ensure+bootstrap 등 진입 게이트가 내려준 시드 */
  serverSnapshot: CommunityMessengerRoomSnapshot | null | undefined;
};

/**
 * 방 Client 첫 state 에 쓸 스냅샷 — **complete seed 또는 confirmed empty 만**.
 * lastMessage-only 목록 peek·summary cache 는 room timeline paint SSOT 가 아님.
 */
export function pickAuthoritativeMessengerRoomSnapshot(
  input: PickAuthoritativeMessengerRoomSnapshotInput
): CommunityMessengerRoomSnapshot | null {
  const rid = input.roomId.trim();
  if (!rid) return null;

  const server = input.serverSnapshot;
  const serverUsable =
    server && isAuthoritativeRoomSnapshotCandidate(server) ? server : null;

  const viewer = input.viewerUserId.trim();
  const cached = viewer ? peekRoomSnapshot(rid, viewer) : null;
  const hot = viewer ? peekHotRoomSnapshot(rid, viewer) : null;

  const richest = pickRichestAuthoritativeRoomSnapshot(serverUsable, cached, hot);
  if (richest) return richest;

  if (serverUsable) return serverUsable;

  return null;
}

/** IndexedDB local-first — incomplete seed 로 loaded 완료 처리 금지 */
export function shouldPromoteLocalRoomSnapshotToEntryLoaded(
  local: CommunityMessengerRoomSnapshot | null | undefined
): boolean {
  return isAuthoritativeMessengerRoomEntrySnapshot(local);
}

/** BootstrapGate — RoomClient mount 허용 여부 */
export function canMountCommunityMessengerRoomClient(
  snapshot: CommunityMessengerRoomSnapshot | null | undefined
): boolean {
  return isAuthoritativeMessengerRoomEntrySnapshot(snapshot);
}

/** 진입 계약 검증 — dev·테스트·ensure+bootstrap 응답 */
export function assertStoreOrderRoomBootstrapHasTimelineSeed(
  snapshot: CommunityMessengerRoomSnapshot | null | undefined
): { ok: true } | { ok: false; reason: string } {
  if (!snapshot || snapshot.clientShellPlaceholder) {
    return { ok: false, reason: "missing_snapshot" };
  }
  const rid = snapshot.room?.id?.trim();
  if (!rid) return { ok: false, reason: "missing_room_id" };
  const meta = snapshot.room.contextMeta;
  if (meta?.kind !== "delivery") {
    return isAuthoritativeMessengerRoomEntrySnapshot(snapshot)
      ? { ok: true }
      : { ok: false, reason: "incomplete_timeline_seed" };
  }
  const hasMessages = (snapshot.messages?.length ?? 0) > 0;
  const hasLastMessageHint = Boolean(snapshot.room.lastMessage?.trim());
  if (hasMessages || !hasLastMessageHint) {
    return isAuthoritativeMessengerRoomEntrySnapshot(snapshot)
      ? { ok: true }
      : { ok: false, reason: "incomplete_timeline_seed" };
  }
  return { ok: false, reason: "delivery_room_empty_timeline" };
}
