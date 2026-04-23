/**
 * GET /api/me/store-owner-hub-badge 및 세그먼트 라우트 공통 — 응답 필드 의미·합산은 기존 route.ts 와 동일.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { countPendingAcceptForStore } from "@/lib/stores/owner-store-pending-counts";
import { countRefundRequestedForStore } from "@/lib/stores/owner-store-refund-count";
import { countOpenStoreInquiriesForStore } from "@/lib/stores/count-open-store-inquiries";
import {
  getCachedUserChatUnreadParts,
  sumSocialChatUnread,
  sumTradeChatUnread,
} from "@/lib/chat/user-chat-unread-parts";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { SAMARKET_ROUTES } from "@/lib/app/samarket-route-map";
import { countOwnerOrderChatUnread } from "@/lib/order-chat/service";
import { sumCommunityMessengerParticipantUnread } from "@/lib/community-messenger/community-messenger-unread-total";

export type OwnerHubBadgeApiPayload = {
  ok: true;
  total: number;
  chatUnread: number;
  communityMessengerUnread: number;
  philifeChatUnread: number;
  socialChatUnread: number;
  storeOrderChatUnread: number;
  orderAttention: number;
  inquiryAttention: number;
  storesTabAttention: number;
  storeDeepLink: string | null;
};

type HubStoreLiteRow = { id: string; slug?: string | null };

export type OwnerHubBadgeUnreadPartial = {
  chatUnread: number;
  communityMessengerUnread: number;
  philifeChatUnread: number;
  socialChatUnread: number;
  storeOrderChatUnread: number;
};

export type OwnerHubBadgeStorePartial = {
  orderAttention: number;
  inquiryAttention: number;
  storeDeepLink: string | null;
};

/** 1차: 채팅 미읽음·메신저·매장 주문채팅 unread (스토어 목록·문의·접수 카운트 없음) */
export async function buildOwnerHubBadgeUnreadSegment(
  sbAny: SupabaseClient<any>,
  storesSb: SupabaseClient<any> | null,
  userId: string
): Promise<OwnerHubBadgeUnreadPartial> {
  const unreadParts = await getCachedUserChatUnreadParts(sbAny, userId);
  const [storeOrderChatUnread, communityMessengerUnread] = await Promise.all([
    storesSb ? countOwnerOrderChatUnread(storesSb as any, userId).catch(() => 0) : Promise.resolve(0),
    sumCommunityMessengerParticipantUnread(sbAny, userId).catch(() => 0),
  ]);
  return {
    chatUnread: sumTradeChatUnread(unreadParts),
    communityMessengerUnread: Math.max(0, communityMessengerUnread),
    philifeChatUnread: Math.max(0, unreadParts.communityParticipantUnread),
    socialChatUnread: sumSocialChatUnread(unreadParts),
    storeOrderChatUnread,
  };
}

async function findOwnerHubStore(
  storesSb: SupabaseClient<any> | null,
  userId: string
): Promise<HubStoreLiteRow | null> {
  if (!storesSb) return null;
  /**
   * 이전 구현은 owner의 stores 전체 + store_sales_permissions 전체를 읽은 뒤
   * 클라이언트에서 허브 매장 1개를 선별했다.
   * 매장 수가 늘수록 O(n)으로 커지므로, DB에서 조건 일치 1건만 직접 조회한다.
   */
  const { data, error } = await storesSb
    .from("stores")
    .select("id,slug,store_sales_permissions!inner(allowed_to_sell,sales_status)")
    .eq("owner_user_id", userId)
    .eq("approval_status", "approved")
    .eq("is_visible", true)
    .eq("store_sales_permissions.allowed_to_sell", true)
    .eq("store_sales_permissions.sales_status", "approved")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !Array.isArray(data) || data.length <= 0) return null;
  const row = data[0] as { id?: unknown; slug?: unknown };
  if (typeof row.id !== "string" || !row.id.trim()) return null;
  return {
    id: row.id.trim(),
    slug: typeof row.slug === "string" ? row.slug : null,
  };
}

/** 허브 매장 1건 기준 접수/환불·문의·딥링크 계산 */
export async function resolveOwnerHubBadgeStoreAttentionFromHubStore(
  storesSb: SupabaseClient<any> | null,
  hubStore: HubStoreLiteRow | null,
  storeOrderChatUnread: number
): Promise<OwnerHubBadgeStorePartial> {
  let orderAttention = 0;
  let inquiryAttention = 0;
  let storeDeepLink: string | null = null;

  if (!storesSb || !hubStore) {
    return { orderAttention, inquiryAttention, storeDeepLink };
  }
  const [refund, pending, openInq] = await Promise.all([
    countRefundRequestedForStore(storesSb, hubStore.id),
    countPendingAcceptForStore(storesSb, hubStore.id),
    countOpenStoreInquiriesForStore(storesSb, hubStore.id),
  ]);
  orderAttention = Math.max(0, refund) + Math.max(0, pending);
  inquiryAttention = Math.max(0, openInq);
  if (inquiryAttention > 0) {
    storeDeepLink = `/my/business/inquiries?storeId=${encodeURIComponent(hubStore.id)}`;
  } else if (orderAttention > 0) {
    storeDeepLink = buildStoreOrdersHref({ storeId: hubStore.id });
  } else if (storeOrderChatUnread > 0) {
    storeDeepLink = SAMARKET_ROUTES.orders.storeOrders;
  }

  return { orderAttention, inquiryAttention, storeDeepLink };
}

/** 2차 단독 라우트: 스토어 목록부터 조회 */
export async function buildOwnerHubBadgeStoreAttentionSegment(
  storesSb: SupabaseClient<any> | null,
  userId: string,
  storeOrderChatUnread: number
): Promise<OwnerHubBadgeStorePartial> {
  const hubStore = await findOwnerHubStore(storesSb, userId);
  return resolveOwnerHubBadgeStoreAttentionFromHubStore(storesSb, hubStore, storeOrderChatUnread);
}

export function mergeOwnerHubBadgeUnreadAndStore(
  unread: OwnerHubBadgeUnreadPartial,
  store: OwnerHubBadgeStorePartial
): OwnerHubBadgeApiPayload {
  const { chatUnread, communityMessengerUnread, philifeChatUnread, socialChatUnread, storeOrderChatUnread } = unread;
  const { orderAttention, inquiryAttention } = store;
  let storeDeepLink = store.storeDeepLink;
  if (!storeDeepLink && storeOrderChatUnread > 0) {
    storeDeepLink = SAMARKET_ROUTES.orders.storeOrders;
  }
  const storesTabAttention =
    Math.max(0, orderAttention) + Math.max(0, inquiryAttention) + storeOrderChatUnread;
  const total = socialChatUnread + storesTabAttention + Math.max(0, communityMessengerUnread);
  return {
    ok: true,
    total,
    chatUnread,
    communityMessengerUnread,
    philifeChatUnread,
    socialChatUnread,
    storeOrderChatUnread,
    orderAttention,
    inquiryAttention,
    storesTabAttention,
    storeDeepLink,
  };
}

/**
 * 메인 라우트·캐시 팩토리 — 기존 route 와 동일한 병렬도:
 * wave1: unread parts + store 목록, wave2: 주문채팅 unread + 메신저 합, 이후 허브 카운트.
 */
export async function buildOwnerHubBadgePayloadMerged(
  sbAny: SupabaseClient<any>,
  storesSb: SupabaseClient<any> | null,
  userId: string
): Promise<OwnerHubBadgeApiPayload> {
  const [unreadParts, hubStore] = await Promise.all([
    getCachedUserChatUnreadParts(sbAny, userId),
    findOwnerHubStore(storesSb, userId),
  ]);

  const [storeOrderChatUnread, communityMessengerUnread] = await Promise.all([
    storesSb ? countOwnerOrderChatUnread(storesSb as any, userId).catch(() => 0) : Promise.resolve(0),
    sumCommunityMessengerParticipantUnread(sbAny, userId).catch(() => 0),
  ]);

  const unread: OwnerHubBadgeUnreadPartial = {
    chatUnread: sumTradeChatUnread(unreadParts),
    communityMessengerUnread: Math.max(0, communityMessengerUnread),
    philifeChatUnread: Math.max(0, unreadParts.communityParticipantUnread),
    socialChatUnread: sumSocialChatUnread(unreadParts),
    storeOrderChatUnread,
  };

  const store = await resolveOwnerHubBadgeStoreAttentionFromHubStore(storesSb, hubStore, storeOrderChatUnread);
  return mergeOwnerHubBadgeUnreadAndStore(unread, store);
}
