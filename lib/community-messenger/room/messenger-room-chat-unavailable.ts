/**
 * 메신저 방 「채팅을 할 수 없습니다」 — 막힘 사유 판정 단일 정의 (Owner 2026-11-02 · S-1 §4 UI·UX·CTA SSOT).
 *
 * - 사유 어휘 = 서버 발송 거부 코드(`MessengerSendGuardError`). 판정 순서도 서버 게이트
 *   (`assert-messenger-room-send-allowed.ts`)와 같다: 방 삭제 → 관리자 차단 → 보관 → 읽기 전용 → 차단·거절 → 거래 → 주문 종료.
 * - 문구 = 서버 오류 문구표(`getMessengerRoomActionErrorMessage`) 하나 — 안내 줄 2행과 발송 실패 스낵바가 같은 문장.
 * - 예외(Owner 결정): 상대가 나를 차단한 경우 사유 줄 없음(`hideReason`).
 * - `roomUnavailable` 권위(composer-surface / -early / phase2 presentation)가 true 일 때만 쓴다.
 */

import { isTerminalStoreOrderStatus } from "@/lib/community-messenger/store-order-terminal-status";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

export type MessengerRoomChatUnavailable = {
  /** 서버 발송 거부 코드 (거래는 `tradeMessaging.denyCode`) · 알 수 없으면 null */
  code: string | null;
  /** 거래 서버가 준 사유 문구(코드 문구가 없을 때만 사용) */
  fallbackMessage?: string | null;
  hideReason: boolean;
  /** 거래 막힘 — 「상품 보기」 행동 버튼 대상 */
  isTrade: boolean;
};

type SnapshotInput = Pick<
  CommunityMessengerRoomSnapshot,
  "room" | "members" | "directMessageDenied" | "tradeMessaging"
> & {
  clientShellPlaceholder?: boolean;
};

export function resolveMessengerRoomChatUnavailable(input: {
  snapshot: SnapshotInput;
  roomUnavailable: boolean;
}): MessengerRoomChatUnavailable | null {
  const { snapshot } = input;
  if (!input.roomUnavailable) return null;
  /** 목록 캐시로 그린 임시 셸 — 실제 스냅샷 도착 전 잘못된 안내를 띄우지 않는다 */
  if (snapshot.clientShellPlaceholder) return null;
  const room = snapshot.room;
  const plain = (code: string | null): MessengerRoomChatUnavailable => ({ code, hideReason: false, isTrade: false });

  if (room.deletedAt) return plain("room_deleted");
  if (room.roomStatus === "blocked") return plain("room_blocked");
  if (room.roomStatus !== "active") return plain("room_archived");
  if (room.isReadonly) return plain("room_readonly");
  if (snapshot.directMessageDenied === "blocked") {
    const peerUserId = (room.peerUserId ?? "").trim();
    const blockedByMe = Boolean(
      peerUserId && snapshot.members?.find((m) => m.id.trim() === peerUserId)?.blocked
    );
    return { code: "blocked_target", hideReason: !blockedByMe, isTrade: false };
  }
  if (snapshot.directMessageDenied === "rejected_by_peer") return plain("rejected_by_peer");
  const tm = snapshot.tradeMessaging;
  if (tm && tm.canSendMessage === false) {
    return {
      code: tm.denyCode ?? null,
      fallbackMessage: tm.denyMessage ?? null,
      hideReason: false,
      isTrade: true,
    };
  }
  if (isTerminalStoreOrderStatus(room.contextMeta?.orderStatus)) return plain("store_order_chat_closed");
  return plain(null);
}
