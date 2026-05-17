import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BUYER_STORE_COMMERCE_NOTIFICATION_META_KINDS,
  OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS,
} from "@/lib/notifications/owner-store-commerce-notification-meta";

function ownerCommerceKindOrFilter(): string {
  return Array.from(OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS)
    .map((k) => `meta->>kind.eq.${k}`)
    .join(",");
}

function inList(values: Iterable<string>): string {
  return `(${Array.from(values).join(",")})`;
}

/** 매장 오너 전용 매장주문 미읽음 — RPC 우선, 없으면 head count */
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

/** exclude_owner_store_commerce=1 — 비-commerce + commerce 중 오너 kind 제외 */
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
  return Math.max(0, Math.floor(Number(nonCommerce.count) || 0))
    + Math.max(0, Math.floor(Number(commerceNonOwner.count) || 0));
}

const CHAT_META_KINDS = ["community_chat", "trade_chat", "group_chat"] as const;

/**
 * exclude_owner + exclude_chat_message (상단 종)
 * — notification_type=chat 제외, commerce는 오너·채팅 meta kind 제외
 */
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
      .neq("notification_type", "chat"),
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
  return Math.max(0, Math.floor(Number(nonCommerce.count) || 0))
    + Math.max(0, Math.floor(Number(commerceSegment.count) || 0));
}

/** 하단 네비 — 오너·구매자 commerce kind 모두 제외 + chat type 제외 */
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
      .neq("notification_type", "chat"),
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
  return Math.max(0, Math.floor(Number(nonCommerce.count) || 0))
    + Math.max(0, Math.floor(Number(commerceSegment.count) || 0));
}
