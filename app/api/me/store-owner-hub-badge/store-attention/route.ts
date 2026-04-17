/**
 * 허브 배지 2차 세그먼트: 매장 허브 접수·환불·문의 + 허브 기준 storeDeepLink(주문채팅 분기는 내부에서 재집계).
 */
import { NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  buildOwnerHubBadgeStoreAttentionSegment,
} from "@/lib/chats/build-owner-hub-badge-payload";
import { countOwnerOrderChatUnread } from "@/lib/order-chat/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({
      ok: true,
      segment: "store_attention" as const,
      degraded: true,
      orderAttention: 0,
      inquiryAttention: 0,
      storeDeepLink: null,
    });
  }

  const userId = await getOptionalAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({
      ok: true,
      segment: "store_attention" as const,
      orderAttention: 0,
      inquiryAttention: 0,
      storeDeepLink: null,
    });
  }

  const storesSb = tryGetSupabaseForStores();
  const storeOrderChatUnread = storesSb
    ? await countOwnerOrderChatUnread(storesSb as any, userId).catch(() => 0)
    : 0;
  const partial = await buildOwnerHubBadgeStoreAttentionSegment(storesSb, userId, storeOrderChatUnread);
  return NextResponse.json({ ok: true as const, segment: "store_attention" as const, ...partial });
}
