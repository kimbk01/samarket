/**
 * 메신저 방 「채팅을 할 수 없습니다」 안내 줄 — 사유 판정 단일 정의 (Owner 2026-11-02).
 * `roomUnavailable` 권위(use-messenger-room-composer-surface / -early / phase2 presentation)가 true 일 때만 쓴다.
 * 거래 발송 막힘(`tradeOnlyBlocked`)은 기존 노란 안내 상자가 담당하므로 여기서 제외한다.
 * 상대가 나를 차단한 경우는 사유를 붙이지 않는다(Owner 결정: 「채팅을 할 수 없습니다」만).
 */

import { isTerminalStoreOrderStatus } from "@/lib/community-messenger/store-order-terminal-status";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

export type MessengerRoomChatUnavailableReason =
  | "blocked_by_me"
  | "blocked_by_peer"
  | "rejected_by_peer"
  | "store_order_closed"
  | "readonly"
  | "room_blocked"
  | "archived"
  | "unknown";

type SnapshotInput = Pick<CommunityMessengerRoomSnapshot, "room" | "members" | "directMessageDenied"> & {
  clientShellPlaceholder?: boolean;
};

export function resolveMessengerRoomChatUnavailableReason(input: {
  snapshot: SnapshotInput;
  roomUnavailable: boolean;
  tradeOnlyBlocked: boolean;
}): MessengerRoomChatUnavailableReason | null {
  const { snapshot } = input;
  if (!input.roomUnavailable || input.tradeOnlyBlocked) return null;
  /** 목록 캐시로 그린 임시 셸 — 실제 스냅샷 도착 전 잘못된 안내를 띄우지 않는다 */
  if (snapshot.clientShellPlaceholder) return null;
  if (snapshot.directMessageDenied === "blocked") {
    const peerUserId = (snapshot.room.peerUserId ?? "").trim();
    const blockedByMe = Boolean(
      peerUserId && snapshot.members?.find((m) => m.id.trim() === peerUserId)?.blocked
    );
    return blockedByMe ? "blocked_by_me" : "blocked_by_peer";
  }
  if (snapshot.directMessageDenied === "rejected_by_peer") return "rejected_by_peer";
  if (isTerminalStoreOrderStatus(snapshot.room.contextMeta?.orderStatus)) return "store_order_closed";
  if (snapshot.room.isReadonly) return "readonly";
  if (snapshot.room.roomStatus === "blocked") return "room_blocked";
  if (snapshot.room.roomStatus !== "active" || snapshot.room.deletedAt) return "archived";
  return "unknown";
}
