/**
 * Domain List Canary (trade · store_order) — sole row mutation writers for those surfaces.
 * Bus entry stays in DomainRoomStateRealtimeHost; final mutate happens here once.
 *
 * @see docs/community-messenger/telegram-list-authority-writer-audit.md
 */
import {
  assertListMutationFields,
  isServerLastMessageAtStale,
  logListAuthorityMutation,
  logListAuthorityViolation,
} from "@/lib/chat-domain/list/domain-list-mutation-contract";
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

/** 거래 리스트 캐시에 새 메시지 patch. 캐시에 없는 방은 조용히 무시. */
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
  if (isServerLastMessageAtStale(prevRow.lastMessageAt, input.lastMessageAt)) {
    logListAuthorityViolation("STALE_SERVER_PREVIEW_OVERWRITE", {
      surface: "trade",
      roomId: input.roomId,
      storeAt: prevRow.lastMessageAt,
      serverAt: input.lastMessageAt,
    });
    return false;
  }
  if (
    !input.boostUnread &&
    prevRow.previewText === input.previewText &&
    prevRow.lastMessageAt === input.lastMessageAt
  ) {
    logListAuthorityViolation("DUPLICATE_EVENT_APPLIED", {
      surface: "trade",
      roomId: input.roomId,
      mutationType: "MESSAGE_SENT",
    });
    return false;
  }
  const mutationType = input.boostUnread ? "MESSAGE_RECEIVED" : "MESSAGE_SENT";
  const changedFields = input.boostUnread
    ? (["previewText", "lastMessageAt", "unreadCount"] as const)
    : (["previewText", "lastMessageAt"] as const);
  assertListMutationFields({
    type: mutationType,
    changedFields,
    surface: "trade",
    roomId: input.roomId,
  });
  const prevLma = prevRow.lastMessageAt;
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
  logListAuthorityMutation({
    surface: "trade",
    roomId: input.roomId,
    mutationType,
    changedFields,
    listOrderChanged: prevLma !== input.lastMessageAt,
    writerName: "applyDomainTradeListRealtimeMessagePatch",
    previousLastMessageAt: prevLma,
    nextLastMessageAt: input.lastMessageAt,
  });
  return true;
}

/** 거래 리스트 — MARK_READ unread만. */
export function applyDomainTradeListReadPatch(input: {
  viewerUserId: string;
  roomId: string;
}): boolean {
  return applyDomainTradeListUnreadOnlyPatch({
    viewerUserId: input.viewerUserId,
    roomId: input.roomId,
    unreadCount: 0,
    mutationType: "MARK_READ",
  });
}

/** 거래 리스트 — PARTICIPANT_UNREAD / MARK_READ unread-only (preview 금지). */
export function applyDomainTradeListUnreadOnlyPatch(input: {
  viewerUserId: string;
  roomId: string;
  unreadCount: number;
  mutationType?: "MARK_READ" | "PARTICIPANT_UNREAD";
}): boolean {
  const cached = peekDomainTradeListCanaryCache(input.viewerUserId);
  if (!cached) return false;
  const idx = cached.rows.findIndex((r) => r.roomId === input.roomId);
  if (idx === -1) return false;
  const nextUnread = Math.max(0, Math.floor(Number(input.unreadCount) || 0));
  if (cached.rows[idx]!.unreadCount === nextUnread) return false;
  const mutationType = input.mutationType ?? (nextUnread === 0 ? "MARK_READ" : "PARTICIPANT_UNREAD");
  assertListMutationFields({
    type: mutationType,
    changedFields: ["unreadCount"],
    surface: "trade",
    roomId: input.roomId,
  });
  const rows = cached.rows.map((r, i) => (i === idx ? { ...r, unreadCount: nextUnread } : r));
  const stabilized = stabilizeTradeListDto({ ...cached, rows });
  primeDomainTradeListCanaryCache(stabilized);
  notifyDomainListCanaryPatch("trade");
  logListAuthorityMutation({
    surface: "trade",
    roomId: input.roomId,
    mutationType,
    changedFields: ["unreadCount"],
    listOrderChanged: false,
    writerName: "applyDomainTradeListUnreadOnlyPatch",
  });
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
  if (isServerLastMessageAtStale(prevRow.lastMessageAt, input.lastMessageAt)) {
    logListAuthorityViolation("STALE_SERVER_PREVIEW_OVERWRITE", {
      surface: "store_order",
      roomId: input.roomId,
      storeAt: prevRow.lastMessageAt,
      serverAt: input.lastMessageAt,
    });
    return false;
  }
  if (
    !input.boostUnread &&
    prevRow.previewText === input.previewText &&
    prevRow.lastMessageAt === input.lastMessageAt
  ) {
    return false;
  }
  const mutationType = input.boostUnread ? "MESSAGE_RECEIVED" : "MESSAGE_SENT";
  const changedFields = input.boostUnread
    ? (["previewText", "lastMessageAt", "unreadCount"] as const)
    : (["previewText", "lastMessageAt"] as const);
  const prevLma = prevRow.lastMessageAt;
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
  logListAuthorityMutation({
    surface: "store_order",
    roomId: input.roomId,
    mutationType,
    changedFields,
    listOrderChanged: prevLma !== input.lastMessageAt,
    writerName: "applyDomainStoreOrderListRealtimeMessagePatch",
    previousLastMessageAt: prevLma,
    nextLastMessageAt: input.lastMessageAt,
  });
  return true;
}

/** 주문(고객) 리스트 — MARK_READ unread만. */
export function applyDomainStoreOrderListReadPatch(input: {
  viewerUserId: string;
  roomId: string;
}): boolean {
  return applyDomainStoreOrderListUnreadOnlyPatch({
    viewerUserId: input.viewerUserId,
    roomId: input.roomId,
    unreadCount: 0,
    mutationType: "MARK_READ",
  });
}

export function applyDomainStoreOrderListUnreadOnlyPatch(input: {
  viewerUserId: string;
  roomId: string;
  unreadCount: number;
  mutationType?: "MARK_READ" | "PARTICIPANT_UNREAD";
}): boolean {
  const cached = peekDomainStoreOrderCustomerListCanaryCache(input.viewerUserId);
  if (!cached) return false;
  const idx = cached.rows.findIndex((r) => r.roomId === input.roomId);
  if (idx === -1) return false;
  const nextUnread = Math.max(0, Math.floor(Number(input.unreadCount) || 0));
  if (cached.rows[idx]!.unreadCount === nextUnread) return false;
  const mutationType = input.mutationType ?? (nextUnread === 0 ? "MARK_READ" : "PARTICIPANT_UNREAD");
  const rows = cached.rows.map((r, i) => (i === idx ? { ...r, unreadCount: nextUnread } : r));
  const stabilized = stabilizeSoCustomerListDto({ ...cached, rows });
  primeDomainStoreOrderCustomerListCanaryCache(stabilized);
  notifyDomainListCanaryPatch("store_order");
  logListAuthorityMutation({
    surface: "store_order",
    roomId: input.roomId,
    mutationType,
    changedFields: ["unreadCount"],
    listOrderChanged: false,
    writerName: "applyDomainStoreOrderListUnreadOnlyPatch",
  });
  return true;
}

/** roomId만 알 때 MARK_READ — 두 캐시에 순서대로 시도. */
export function applyDomainListCanaryReadPatchByRoomId(input: {
  viewerUserId: string;
  roomId: string;
}): void {
  applyDomainTradeListReadPatch(input);
  applyDomainStoreOrderListReadPatch(input);
}

/** PARTICIPANT_UNREAD — unread only, no preview. */
export function applyDomainListCanaryUnreadOnlyPatchByRoomId(input: {
  viewerUserId: string;
  roomId: string;
  unreadCount: number;
}): void {
  applyDomainTradeListUnreadOnlyPatch({
    ...input,
    mutationType: "PARTICIPANT_UNREAD",
  });
  applyDomainStoreOrderListUnreadOnlyPatch({
    ...input,
    mutationType: "PARTICIPANT_UNREAD",
  });
}
