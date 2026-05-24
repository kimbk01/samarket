import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { peekRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import { getMessengerRealtimeRoomMessages } from "@/lib/community-messenger/stores/messenger-realtime-store";

export type PickAuthoritativeMessengerRoomSnapshotInput = {
  roomId: string;
  viewerUserId: string;
  /** BootstrapGate·주문 슬라이드·ensure+bootstrap 등 진입 게이트가 내려준 시드 */
  serverSnapshot: CommunityMessengerRoomSnapshot | null | undefined;
};

/**
 * 방 Client 첫 state 에 쓸 스냅샷 — **진입 게이트 시드가 peek 캐시(목록 stub·realtime 1건)보다 우선**.
 * 시드·캐시 둘 다 있을 때는 메시지 수가 더 많은 쪽을 택한다(히스토리 유실 방지).
 */
export function pickAuthoritativeMessengerRoomSnapshot(
  input: PickAuthoritativeMessengerRoomSnapshotInput
): CommunityMessengerRoomSnapshot | null {
  const rid = input.roomId.trim();
  if (!rid) return null;

  const server = input.serverSnapshot;
  const serverUsable =
    server && !server.clientShellPlaceholder ? server : null;

  const viewer = input.viewerUserId.trim();
  let cached: CommunityMessengerRoomSnapshot | null = null;
  if (viewer) {
    cached = peekRoomSnapshot(rid, viewer);
  } else {
    cached = peekRoomSnapshot(rid);
  }

  if (serverUsable && cached) {
    const serverCount = serverUsable.messages?.length ?? 0;
    const cachedCount = cached.messages?.length ?? 0;
    if (serverCount >= cachedCount) return serverUsable;
    if (cachedCount > serverCount) return cached;
    return serverUsable;
  }

  if (serverUsable) return serverUsable;
  if (cached) return cached;

  if (viewer) {
    const live = getMessengerRealtimeRoomMessages(rid);
    if (live.length > 0) {
      const seeded = peekRoomSnapshot(rid, viewer);
      if (seeded) return seeded;
    }
  }

  return server ?? null;
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
    return { ok: true };
  }
  const hasMessages = (snapshot.messages?.length ?? 0) > 0;
  const hasLastMessageHint = Boolean(snapshot.room.lastMessage?.trim());
  if (hasMessages || !hasLastMessageHint) {
    return { ok: true };
  }
  return { ok: false, reason: "delivery_room_empty_timeline" };
}
