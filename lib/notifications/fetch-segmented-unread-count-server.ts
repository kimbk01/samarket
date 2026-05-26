import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BUYER_STORE_COMMERCE_NOTIFICATION_META_KINDS,
  OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS,
} from "@/lib/notifications/owner-store-commerce-notification-meta";
import type { UnreadCountMode } from "@/lib/notifications/notification-unread-count-cache";

export const NOTIFICATION_UNREAD_SEGMENTED_RPC = "count_notification_unread_segmented";

function isRpcMissing(err: { message?: string } | null): boolean {
  return /count_notification_unread_segmented|schema cache|function/i.test(String(err?.message ?? ""));
}

/** 단일 RPC — cold 1 RTT (mode별 SQL CASE). */
export async function countNotificationUnreadSegmentedServer(
  sb: SupabaseClient<any>,
  userId: string,
  mode: UnreadCountMode
): Promise<number> {
  const { data, error } = await sb.rpc(NOTIFICATION_UNREAD_SEGMENTED_RPC, {
    p_user_id: userId,
    p_segment: mode,
  });
  if (!error) {
    return Math.max(0, Math.floor(Number(data) || 0));
  }
  if (!isRpcMissing(error)) {
    throw error;
  }
  return countNotificationUnreadSegmentedLegacy(sb, userId, mode);
}

async function countNotificationUnreadSegmentedLegacy(
  sb: SupabaseClient<any>,
  userId: string,
  mode: UnreadCountMode
): Promise<number> {
  switch (mode) {
    case "owner_store_commerce":
      return countOwnerStoreCommerceUnreadServer(sb, userId);
    case "consumer_no_chat":
      return countConsumerUnreadNoChatServer(sb, userId);
    case "bottom_nav_no_chat":
      return countBottomNavUnreadServer(sb, userId);
    case "bottom_nav":
      return countBottomNavUnreadServer(sb, userId);
    case "consumer":
      return countUnreadExcludingOwnerCommerceServer(sb, userId);
    case "all": {
      const { count, error } = await sb
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false);
      if (error) throw error;
      return Math.max(0, Math.floor(Number(count) || 0));
    }
    default:
      return 0;
  }
}

function ownerCommerceKindOrFilter(): string {
  return Array.from(OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS)
    .map((k) => `meta->>kind.eq.${k}`)
    .join(",");
}

function inList(values: Iterable<string>): string {
  return `(${Array.from(values).join(",")})`;
}

/** @deprecated — unified RPC miss fallback */
export async function countOwnerStoreCommerceUnreadServer(
  sb: SupabaseClient<any>,
  userId: string
): Promise<number> {
  const { data: rpcData, error: rpcError } = await sb.rpc("count_owner_store_commerce_unread", {
    p_user_id: userId,
  });
  if (!rpcError) {
    return Math.max(0, Math.floor(Number(rpcData) || 0));
  }
  if (!/count_owner_store_commerce_unread|schema cache|function/i.test(String(rpcError.message ?? ""))) {
    throw rpcError;
  }

  const { count, error } = await sb
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false)
    .eq("notification_type", "commerce")
    .or(ownerCommerceKindOrFilter());

  if (error) throw error;
  return Math.max(0, Math.floor(Number(count) || 0));
}

/** @deprecated — unified RPC miss fallback */
export async function countUnreadExcludingOwnerCommerceServer(
  sb: SupabaseClient<any>,
  userId: string
): Promise<number> {
  const ownerIn = inList(OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS);
  const [nonCommerce, commerceNonOwner] = await Promise.all([
    sb
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false)
      .neq("notification_type", "commerce"),
    sb
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false)
      .eq("notification_type", "commerce")
      .not("meta->>kind", "in", ownerIn),
  ]);

  if (nonCommerce.error) throw nonCommerce.error;
  if (commerceNonOwner.error) throw commerceNonOwner.error;
  return (
    Math.max(0, Math.floor(Number(nonCommerce.count) || 0)) +
    Math.max(0, Math.floor(Number(commerceNonOwner.count) || 0))
  );
}

const CHAT_META_KINDS = ["community_chat", "trade_chat", "group_chat"] as const;

/** @deprecated — unified RPC miss fallback */
export async function countConsumerUnreadNoChatServer(
  sb: SupabaseClient<any>,
  userId: string
): Promise<number> {
  const { data: rpcData, error: rpcError } = await sb.rpc("count_consumer_unread_no_chat", {
    p_user_id: userId,
  });
  if (!rpcError) {
    return Math.max(0, Math.floor(Number(rpcData) || 0));
  }
  if (!/count_consumer_unread_no_chat|schema cache|function/i.test(String(rpcError.message ?? ""))) {
    throw rpcError;
  }

  const ownerIn = inList(OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS);
  const chatMetaIn = inList(CHAT_META_KINDS);
  const [nonCommerce, commerceSegment] = await Promise.all([
    sb
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false)
      .neq("notification_type", "commerce")
      .neq("notification_type", "chat")
      .neq("push_kind", "chat")
      .not("meta->>kind", "in", chatMetaIn),
    sb
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false)
      .eq("notification_type", "commerce")
      .not("meta->>kind", "in", ownerIn)
      .not("meta->>kind", "in", chatMetaIn),
  ]);

  if (nonCommerce.error) throw nonCommerce.error;
  if (commerceSegment.error) throw commerceSegment.error;
  return (
    Math.max(0, Math.floor(Number(nonCommerce.count) || 0)) +
    Math.max(0, Math.floor(Number(commerceSegment.count) || 0))
  );
}

/** @deprecated — unified RPC miss fallback */
export async function countBottomNavUnreadServer(
  sb: SupabaseClient<any>,
  userId: string
): Promise<number> {
  const excludeIn = inList([
    ...OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS,
    ...BUYER_STORE_COMMERCE_NOTIFICATION_META_KINDS,
  ]);
  const chatMetaIn = inList(CHAT_META_KINDS);
  const [nonCommerce, commerceSegment] = await Promise.all([
    sb
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false)
      .neq("notification_type", "commerce")
      .neq("notification_type", "chat")
      .neq("push_kind", "chat")
      .not("meta->>kind", "in", chatMetaIn),
    sb
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false)
      .eq("notification_type", "commerce")
      .not("meta->>kind", "in", excludeIn)
      .not("meta->>kind", "in", chatMetaIn),
  ]);

  if (nonCommerce.error) throw nonCommerce.error;
  if (commerceSegment.error) throw commerceSegment.error;
  return (
    Math.max(0, Math.floor(Number(nonCommerce.count) || 0)) +
    Math.max(0, Math.floor(Number(commerceSegment.count) || 0))
  );
}
