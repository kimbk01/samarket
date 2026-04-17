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

type SalesPerm = { allowed_to_sell: boolean; sales_status: string };

function computeCanSell(sales: SalesPerm | null | undefined): boolean {
  return !!sales && sales.allowed_to_sell === true && sales.sales_status === "approved";
}

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

/** store list 조회 결과로 허브 매장·접수/환불·문의·딥링크(허브 내부 storeOrder 분기만) */
export async function resolveOwnerHubBadgeStoreAttentionFromStoreList(
  storesSb: SupabaseClient<any> | null,
  userId: string,
  storeListRes: { data: unknown; error: unknown },
  storeOrderChatUnread: number
): Promise<OwnerHubBadgeStorePartial> {
  let orderAttention = 0;
  let inquiryAttention = 0;
  let storeDeepLink: string | null = null;

  if (!storesSb || storeListRes.error || !Array.isArray(storeListRes.data) || !storeListRes.data.length) {
    return { orderAttention, inquiryAttention, storeDeepLink };
  }

  const storeRows = storeListRes.data;
  const ids = (storeRows as { id: string }[]).map((s) => s.id);
  const { data: perms } = await storesSb
    .from("store_sales_permissions")
    .select("store_id, allowed_to_sell, sales_status")
    .in("store_id", ids);
  const permByStore = new Map(
    (perms ?? []).map((p: { store_id: string; allowed_to_sell?: boolean; sales_status?: string }) => [
      p.store_id,
      { allowed_to_sell: !!p.allowed_to_sell, sales_status: String(p.sales_status ?? "") },
    ])
  );
  const hubStore = (
    storeRows as { id: string; slug?: string | null; approval_status?: string; is_visible?: boolean }[]
  ).find((s) => {
    const sales = permByStore.get(s.id);
    return String(s.approval_status) === "approved" && s.is_visible === true && computeCanSell(sales);
  });

  if (hubStore) {
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
  }

  return { orderAttention, inquiryAttention, storeDeepLink };
}

/** 2차 단독 라우트: 스토어 목록부터 조회 */
export async function buildOwnerHubBadgeStoreAttentionSegment(
  storesSb: SupabaseClient<any> | null,
  userId: string,
  storeOrderChatUnread: number
): Promise<OwnerHubBadgeStorePartial> {
  if (!storesSb) {
    return { orderAttention: 0, inquiryAttention: 0, storeDeepLink: null };
  }
  const storeListRes = await storesSb
    .from("stores")
    .select("id, slug, approval_status, is_visible")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: false });
  return resolveOwnerHubBadgeStoreAttentionFromStoreList(storesSb, userId, storeListRes, storeOrderChatUnread);
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
  const [unreadParts, storeListRes] = await Promise.all([
    getCachedUserChatUnreadParts(sbAny, userId),
    storesSb
      ? storesSb
          .from("stores")
          .select("id, slug, approval_status, is_visible")
          .eq("owner_user_id", userId)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: null as unknown, error: { message: "no_stores_sb" } }),
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

  const store = await resolveOwnerHubBadgeStoreAttentionFromStoreList(
    storesSb,
    userId,
    storeListRes as { data: unknown; error: unknown },
    storeOrderChatUnread
  );
  return mergeOwnerHubBadgeUnreadAndStore(unread, store);
}
