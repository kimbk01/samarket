import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { fetchNotificationBadgeCount } from "@/lib/notifications/pipeline/notify-badge-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({
      ok: true,
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
    });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("fresh") === "1";
  const counts = await fetchNotificationBadgeCount(sb, userId, { force });

  return NextResponse.json({
    ok: true,
    ...counts,
    chat_message: counts.chatMessage ?? 0,
    group_message: counts.groupMessage ?? 0,
    trade_message: counts.tradeMessage ?? 0,
    trade_status: counts.tradeStatus ?? 0,
    order_status: counts.orderStatus ?? 0,
    delivery_status: counts.deliveryStatus ?? 0,
    community_activity: counts.communityActivity ?? 0,
    admin_marketing_banner: counts.adminMarketingBanner ?? 0,
    admin_notice: counts.adminNotice ?? 0,
    missed_call: counts.missedCall,
  });
}
