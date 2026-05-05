import {
  cmReadBadgeLog,
  resolveUnreadWithLocalReadGuard,
} from "@/lib/community-messenger/read/local-read-guard";
import type {
  CommunityMessengerRoomContextMetaV1,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

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

export function mergeMessengerRoomSummaryForHomeSyncCriticalPatch(
  prev: CommunityMessengerRoomSummary | undefined,
  incoming: CommunityMessengerRoomSummary
): CommunityMessengerRoomSummary {
  if (!prev) return incoming;
  const mergedMeta = mergeTradeRoomContextMetaPreferLocalDetail(prev.contextMeta, incoming.contextMeta);
  const merged = { ...incoming, contextMeta: mergedMeta ?? incoming.contextMeta ?? null };
  const unreadResolved = resolveUnreadWithLocalReadGuard({
    roomId: incoming.id,
    incomingUnread: merged.unreadCount,
    incomingLastMessageAt: String(merged.lastMessageAt ?? ""),
  });
  if (unreadResolved.suppressed) {
    cmReadBadgeLog("stale_unread_ignored_home_sync", {
      roomId: incoming.id,
      incomingUnread: merged.unreadCount,
      incomingLastMessageAt: String(merged.lastMessageAt ?? ""),
    });
    return { ...merged, unreadCount: unreadResolved.unreadCount };
  }
  if (unreadResolved.allowedNewMessage && merged.unreadCount > 0) {
    cmReadBadgeLog("unread_allowed_new_message", {
      roomId: incoming.id,
      source: "home_sync_critical_patch",
      incomingUnread: merged.unreadCount,
    });
  }
  return { ...merged, unreadCount: unreadResolved.unreadCount };
}
