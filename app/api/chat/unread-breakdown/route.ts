/**
 * 채팅 미읽음 — 거래 허브 vs 매장 주문 채팅 구분 (탭 배지·주문 전용 알림음용)
 * GET /api/chat/unread-breakdown
 */
import { NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { createClient } from "@supabase/supabase-js";
import { computeUserChatUnreadParts } from "@/lib/chat/user-chat-unread-parts";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ total: 0, tradeTotal: 0, orderTotal: 0 }, { status: 200 });
  }

  const userId = await getOptionalAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ total: 0, tradeTotal: 0, orderTotal: 0 }, { status: 200 });
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  const p = await computeUserChatUnreadParts(sbAny, userId);
  const orderTotal = p.storeOrderParticipantUnread;
  const tradeTotal = p.productChatUnreadDeduped + p.otherParticipantUnread;
  const total = orderTotal + tradeTotal;

  return NextResponse.json({ total, tradeTotal, orderTotal });
}
