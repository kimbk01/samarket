import { coalesceRoomSummarySnapshotRow } from "@/lib/community-messenger/consistency/messenger-consistency-merge";
import {
  incomingLastMessageIsAfterReference,
  shouldSuppressStaleUnread,
} from "@/lib/community-messenger/read/local-read-guard";
import { normalizeMessengerRealtimeRoomId } from "@/lib/community-messenger/stores/messenger-realtime-store";
import type {
  CommunityMessengerRoomContextMetaV1,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

/** home list — server unread 증가 직후 stale bus zero 차단 TTL (critical_patch · delta · summary_patch 공유) */
const HOME_LIST_SERVER_UNREAD_INCREASE_TTL_MS = 8_000;

const recentHomeListServerUnreadIncrease = new Map<
  string,
  { unreadCount: number; expiresAt: number }
>();

export function noteHomeListServerUnreadIncrease(roomId: string, unreadCount: number): void {
  const rid = normalizeMessengerRealtimeRoomId(roomId);
  const count = Math.max(0, Math.floor(Number(unreadCount) || 0));
  if (!rid || count <= 0) return;
  recentHomeListServerUnreadIncrease.set(rid, {
    unreadCount: count,
    expiresAt: Date.now() + HOME_LIST_SERVER_UNREAD_INCREASE_TTL_MS,
  });
}

export function peekRecentHomeListServerUnreadIncrease(roomId: string): number | null {
  const rid = normalizeMessengerRealtimeRoomId(roomId);
  if (!rid) return null;
  const row = recentHomeListServerUnreadIncrease.get(rid);
  if (!row) return null;
  if (Date.now() >= row.expiresAt) {
    recentHomeListServerUnreadIncrease.delete(rid);
    return null;
  }
  return row.unreadCount;
}

export function clearHomeListServerUnreadIncrease(roomId: string): void {
  const rid = normalizeMessengerRealtimeRoomId(roomId);
  if (rid) recentHomeListServerUnreadIncrease.delete(rid);
}

export function clearHomeListServerUnreadIncreaseForTests(): void {
  recentHomeListServerUnreadIncrease.clear();
}

function isPlaceholderTradeHeadline(value: string | null | undefined): boolean {
  const t = String(value ?? "").trim();
  return !t || t === "거래";
}

/**
 * `home-sync` `critical_patch` 가 상단 방 목록을 덮을 때, 서버 페이로드가
 * `contextMeta` 를 생략·플레이스홀더만 실은 경우 **클라에 이미 있던 더 풍부한 거래 메타**를 잃지 않게 한다.
 */
export function mergeTradeRoomContextMetaPreferLocalDetail(
  prev: CommunityMessengerRoomContextMetaV1 | null | undefined,
  incoming: CommunityMessengerRoomContextMetaV1 | null | undefined
): CommunityMessengerRoomContextMetaV1 | null | undefined {
  if (!incoming || incoming.kind !== "trade") {
    if (prev?.kind === "trade") return prev;
    return incoming ?? null;
  }
  if (!prev || prev.kind !== "trade") {
    return incoming;
  }

  const out: CommunityMessengerRoomContextMetaV1 = { ...incoming };
  if (isPlaceholderTradeHeadline(incoming.headline) && !isPlaceholderTradeHeadline(prev.headline)) {
    out.headline = prev.headline;
  }
  if (!String(incoming.productCategoryLabel ?? "").trim() && String(prev.productCategoryLabel ?? "").trim()) {
    out.productCategoryLabel = prev.productCategoryLabel;
  }
  if (!String(incoming.categoryMenuLabel ?? "").trim() && String(prev.categoryMenuLabel ?? "").trim()) {
    out.categoryMenuLabel = prev.categoryMenuLabel;
  }
  if (!String(incoming.priceLabel ?? "").trim() && String(prev.priceLabel ?? "").trim()) {
    out.priceLabel = prev.priceLabel;
  }
  const incThumb = typeof incoming.thumbnailUrl === "string" ? incoming.thumbnailUrl.trim() : "";
  const prevThumb = typeof prev.thumbnailUrl === "string" ? prev.thumbnailUrl.trim() : "";
  if (!incThumb && prevThumb) {
    out.thumbnailUrl = prev.thumbnailUrl;
  }
  if (!String(incoming.postId ?? "").trim() && String(prev.postId ?? "").trim()) {
    out.postId = prev.postId;
  }
  if (!String(incoming.productChatId ?? "").trim() && String(prev.productChatId ?? "").trim()) {
    out.productChatId = prev.productChatId;
  }
  if (!String(incoming.itemStateLabel ?? "").trim() && String(prev.itemStateLabel ?? "").trim()) {
    out.itemStateLabel = prev.itemStateLabel;
  }
  if (!String(incoming.sellerDisplayName ?? "").trim() && String(prev.sellerDisplayName ?? "").trim()) {
    out.sellerDisplayName = prev.sellerDisplayName;
  }
  return out;
}

type CriticalPatchReadClearMeta = {
  lastReadMessageId?: string | null;
  viewerLastReadMessageId?: string | null;
};

/** critical_patch 전용 — 실제 read clear 근거가 있는 0 만 허용 */
export function hasCriticalPatchReadClearEvidence(
  prev: CommunityMessengerRoomSummary,
  incoming: CommunityMessengerRoomSummary
): boolean {
  const incomingLastAt = String(incoming.lastMessageAt ?? "");
  const prevLastAt = String(prev.lastMessageAt ?? "");
  if (incomingLastAt && prevLastAt && incomingLastMessageIsAfterReference(prevLastAt, incomingLastAt)) {
    return true;
  }

  const readMeta = incoming as CommunityMessengerRoomSummary & CriticalPatchReadClearMeta;
  const lastReadMessageId = String(
    readMeta.lastReadMessageId ?? readMeta.viewerLastReadMessageId ?? ""
  ).trim();
  if (lastReadMessageId) return true;

  const prevUnread = Math.max(0, Math.floor(Number(prev.unreadCount) || 0));
  if (prevUnread <= 0) return false;

  return shouldSuppressStaleUnread({
    roomId: incoming.id,
    incomingUnread: prevUnread,
    incomingLastMessageAt: incomingLastAt,
  });
}

/** critical_patch — stale payload `unreadCount=0` 이 positive list unread 를 덮지 못하게 한다 */
export function shouldBlockCriticalPatchStaleZeroClobber(
  prev: CommunityMessengerRoomSummary,
  incoming: CommunityMessengerRoomSummary
): boolean {
  const prevUnread = Math.max(0, Math.floor(Number(prev.unreadCount) || 0));
  const incomingUnread = Math.max(0, Math.floor(Number(incoming.unreadCount) || 0));
  if (incomingUnread !== 0 || prevUnread <= 0) return false;

  const incomingLastAt = String(incoming.lastMessageAt ?? "");
  const prevLastAt = String(prev.lastMessageAt ?? "");
  if (incomingLastAt && prevLastAt && incomingLastAt.localeCompare(prevLastAt) > 0) {
    return false;
  }

  if (hasCriticalPatchReadClearEvidence(prev, incoming)) return false;

  const recentServerUnread = peekRecentHomeListServerUnreadIncrease(incoming.id);
  if (recentServerUnread != null && recentServerUnread > 0) return true;

  return true;
}

export function mergeMessengerRoomSummaryForHomeSyncCriticalPatch(
  prev: CommunityMessengerRoomSummary | undefined,
  incoming: CommunityMessengerRoomSummary
): CommunityMessengerRoomSummary {
  if (!prev) return incoming;
  const mergedMeta = mergeTradeRoomContextMetaPreferLocalDetail(prev.contextMeta, incoming.contextMeta);
  const merged = { ...incoming, contextMeta: mergedMeta ?? incoming.contextMeta ?? null };
  const prevUnread = Math.max(0, Math.floor(Number(prev.unreadCount) || 0));
  const incomingUnread = Math.max(0, Math.floor(Number(incoming.unreadCount) || 0));
  const incomingLastAt = String(incoming.lastMessageAt ?? "");
  const prevLastAt = String(prev.lastMessageAt ?? "");
  const lastMessageAtNotOlder =
    !prevLastAt || !incomingLastAt || incomingLastAt.localeCompare(prevLastAt) >= 0;
  const serverUnreadIncreased = incomingUnread > prevUnread;

  // P0 (QA1): server positive unread increase wins over coalesce/read-guard — before stale-zero handling.
  if (serverUnreadIncreased && lastMessageAtNotOlder) {
    const increased = { ...merged, unreadCount: incomingUnread };
    noteHomeListServerUnreadIncrease(incoming.id, incomingUnread);
    return increased;
  }

  const blockedStaleZero = shouldBlockCriticalPatchStaleZeroClobber(prev, incoming);
  const coalesceIncoming = blockedStaleZero ? { ...merged, unreadCount: prevUnread } : merged;
  const coalesced = coalesceRoomSummarySnapshotRow(prev, coalesceIncoming, {
    surface: "home_sync",
    roomId: incoming.id,
    source: "home_sync_critical_patch",
    eventType: "critical_patch",
  });
  const patched = blockedStaleZero ? { ...coalesced, unreadCount: prevUnread } : coalesced;
  const finalUnread = Math.max(0, Math.floor(Number(patched.unreadCount) || 0));
  if (finalUnread > prevUnread) {
    noteHomeListServerUnreadIncrease(incoming.id, finalUnread);
  }
  return patched;
}
