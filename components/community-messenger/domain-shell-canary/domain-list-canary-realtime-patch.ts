/**
 * Domain List Canary(거래·주문 고객 리스트) 실시간 패치.
 *
 * 문제(2026-07-23 확인): `DomainTradeListCanaryGate`/`DomainStoreOrderCustomerListCanaryGate`는
 * 마운트 시 1회 fetch 후 그대로 고정된다 — realtime 구독이 전혀 없어, 그 화면에 머무는 동안
 * 새 메시지가 와도 재진입/새로고침 전까지 반영되지 않는다(Symptom 3의 리스트 화면 쪽 원인).
 *
 * 해결: 새 realtime 구독을 추가하는 대신, 이미 전역에 떠 있는
 * `DomainRoomStateRealtimeHost`가 구독 중인 multi-tab-bus 이벤트(`cm.room.incoming_message`,
 * `cm.room.read`, `cm.room.summary_patch`)에서 이 두 캐시에도 같은 이벤트로 patch를 걸어준다.
 * 서버 API·DB는 건드리지 않는다 — 클라이언트 세션 캐시 patch + 구독 알림만 추가.
 *
 * @see docs/community-messenger/2026-07-23-chat-full-architecture-audit-and-redesign.md §5
 */
import {
  peekDomainTradeListCanaryCache,
  primeDomainTradeListCanaryCache,
} from "@/components/community-messenger/domain-shell-canary/domain-trade-list-canary-cache";
import {
  peekDomainStoreOrderCustomerListCanaryCache,
  primeDomainStoreOrderCustomerListCanaryCache,
} from "@/components/community-messenger/domain-shell-canary/domain-store-order-customer-list-canary-cache";
import {
  stabilizeSoCustomerListDto,
  stabilizeTradeListDto,
} from "@/components/community-messenger/domain-shell-canary/domain-list-canary-stabilize";

export type DomainListCanaryBundle = "trade" | "store_order";

const listeners: Record<DomainListCanaryBundle, Set<() => void>> = {
  trade: new Set(),
  store_order: new Set(),
};

/** Gate 컴포넌트가 마운트 중 patch를 반영해 리렌더하도록 구독. */
export function subscribeDomainListCanaryPatch(
  bundle: DomainListCanaryBundle,
  listener: () => void
): () => void {
  listeners[bundle].add(listener);
  return () => {
    listeners[bundle].delete(listener);
  };
}

function notifyDomainListCanaryPatch(bundle: DomainListCanaryBundle): void {
  for (const l of listeners[bundle]) l();
}

/** 거래 리스트 캐시에 새 메시지 patch. 캐시에 없는(=한 번도 본 적 없는) 방은 조용히 무시(다음 fetch가 채움). */
export function applyDomainTradeListRealtimeMessagePatch(input: {
  viewerUserId: string;
  roomId: string;
  previewText: string;
  lastMessageAt: string;
  boostUnread: boolean;
}): boolean {
  const cached = peekDomainTradeListCanaryCache(input.viewerUserId);
  if (!cached) return false;
  const idx = cached.rows.findIndex((r) => r.roomId === input.roomId);
  if (idx === -1) return false;
  const prevRow = cached.rows[idx]!;
  if (
    !input.boostUnread &&
    prevRow.previewText === input.previewText &&
    prevRow.lastMessageAt === input.lastMessageAt
  ) {
    return false;
  }
  const rows = cached.rows.map((r, i) =>
    i === idx
      ? {
          ...r,
          previewText: input.previewText,
          lastMessageAt: input.lastMessageAt,
          unreadCount: input.boostUnread ? r.unreadCount + 1 : r.unreadCount,
        }
      : r
  );
  const stabilized = stabilizeTradeListDto({ ...cached, rows });
  primeDomainTradeListCanaryCache(stabilized);
  notifyDomainListCanaryPatch("trade");
  return true;
}

/** 거래 리스트 캐시 — 방 읽음 처리 시 unreadCount 0으로. */
export function applyDomainTradeListReadPatch(input: {
  viewerUserId: string;
  roomId: string;
}): boolean {
  const cached = peekDomainTradeListCanaryCache(input.viewerUserId);
  if (!cached) return false;
  const idx = cached.rows.findIndex((r) => r.roomId === input.roomId);
  if (idx === -1 || cached.rows[idx]!.unreadCount === 0) return false;
  const rows = cached.rows.map((r, i) => (i === idx ? { ...r, unreadCount: 0 } : r));
  const stabilized = stabilizeTradeListDto({ ...cached, rows });
  primeDomainTradeListCanaryCache(stabilized);
  notifyDomainListCanaryPatch("trade");
  return true;
}

/** 주문(고객) 리스트 캐시에 새 메시지 patch. */
export function applyDomainStoreOrderListRealtimeMessagePatch(input: {
  viewerUserId: string;
  roomId: string;
  previewText: string;
  lastMessageAt: string;
  boostUnread: boolean;
}): boolean {
  const cached = peekDomainStoreOrderCustomerListCanaryCache(input.viewerUserId);
  if (!cached) return false;
  const idx = cached.rows.findIndex((r) => r.roomId === input.roomId);
  if (idx === -1) return false;
  const prevRow = cached.rows[idx]!;
  if (
    !input.boostUnread &&
    prevRow.previewText === input.previewText &&
    prevRow.lastMessageAt === input.lastMessageAt
  ) {
    return false;
  }
  const rows = cached.rows.map((r, i) =>
    i === idx
      ? {
          ...r,
          previewText: input.previewText,
          lastMessageAt: input.lastMessageAt,
          unreadCount: input.boostUnread ? r.unreadCount + 1 : r.unreadCount,
        }
      : r
  );
  const stabilized = stabilizeSoCustomerListDto({ ...cached, rows });
  primeDomainStoreOrderCustomerListCanaryCache(stabilized);
  notifyDomainListCanaryPatch("store_order");
  return true;
}

/** 주문(고객) 리스트 캐시 — 방 읽음 처리 시 unreadCount 0으로. */
export function applyDomainStoreOrderListReadPatch(input: {
  viewerUserId: string;
  roomId: string;
}): boolean {
  const cached = peekDomainStoreOrderCustomerListCanaryCache(input.viewerUserId);
  if (!cached) return false;
  const idx = cached.rows.findIndex((r) => r.roomId === input.roomId);
  if (idx === -1 || cached.rows[idx]!.unreadCount === 0) return false;
  const rows = cached.rows.map((r, i) => (i === idx ? { ...r, unreadCount: 0 } : r));
  const stabilized = stabilizeSoCustomerListDto({ ...cached, rows });
  primeDomainStoreOrderCustomerListCanaryCache(stabilized);
  notifyDomainListCanaryPatch("store_order");
  return true;
}

/** roomId만 알 때(read/summary_patch 이벤트) 두 캐시에 순서대로 시도 — 없는 쪽은 조용히 no-op. */
export function applyDomainListCanaryReadPatchByRoomId(input: {
  viewerUserId: string;
  roomId: string;
}): void {
  applyDomainTradeListReadPatch(input);
  applyDomainStoreOrderListReadPatch(input);
}
