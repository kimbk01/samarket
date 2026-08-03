import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { fetchDomainBadgeAuthorityPayload } from "@/lib/notifications/pipeline/notify-badge-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY_DOMAIN = {
  ok: true as const,
  authority: "domain_badge" as const,
  projectionVersionMs: 0,
  projection: {
    bellTotal: 0,
    appIconTotal: 0,
    bottomChatTotal: 0,
    domainUnread: {
      general_direct: 0,
      group: 0,
      trade: 0,
      store_order: 0,
    },
    orphanMissedCallCount: 0,
    nonChatNotificationCount: 0,
  },
  domainUnreadRooms: {
    general_direct: 0,
    group: 0,
    trade: 0,
    store_order: 0,
  },
  domainAppIcon: {
    messenger: 0,
    trade: 0,
    storeOrder: 0,
    missedCall: 0,
  },
  storeOrderBuyerDeliveryUnread: 0,
  storeOrderOwnerChatUnread: 0,
  unreadApprovedNotificationEvents: 0,
  notificationAttentionTotal: 0,
  nonChatEventAttention: {
    tradeStatus: 0,
    orderStatus: 0,
    deliveryStatus: 0,
    communityActivity: 0,
    adminNotice: 0,
  },
  missedCallByRoom: {} as Record<string, number>,
  total: 0,
  chatMessage: 0,
  groupMessage: 0,
  tradeMessage: 0,
  tradeStatus: 0,
  orderStatus: 0,
  deliveryStatus: 0,
  communityActivity: 0,
  adminMarketingBanner: 0,
  adminNotice: 0,
  chat: 0,
  group: 0,
  trade: 0,
  store: 0,
  missedCall: 0,
  categoryCounts: {
    total: 0,
    chatMessage: 0,
    groupMessage: 0,
    tradeMessage: 0,
    tradeStatus: 0,
    orderStatus: 0,
    deliveryStatus: 0,
    communityActivity: 0,
    adminMarketingBanner: 0,
    adminNotice: 0,
    chat: 0,
    group: 0,
    trade: 0,
    store: 0,
    missedCall: 0,
  },
};

export async function GET(req: Request) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json(EMPTY_DOMAIN);
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("fresh") === "1";
  const payload = await fetchDomainBadgeAuthorityPayload(sb, userId, { force });

  return NextResponse.json({
    ...payload,
    chat_message: payload.chatMessage ?? 0,
    group_message: payload.groupMessage ?? 0,
    trade_message: payload.tradeMessage ?? 0,
    trade_status: payload.tradeStatus ?? 0,
    order_status: payload.orderStatus ?? 0,
    delivery_status: payload.deliveryStatus ?? 0,
    community_activity: payload.communityActivity ?? 0,
    admin_marketing_banner: payload.adminMarketingBanner ?? 0,
    admin_notice: payload.adminNotice ?? 0,
    missed_call: payload.missedCall,
  });
}
