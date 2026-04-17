/**
 * 배달 입점(스토어) 오너 허브 배지: 소셜 채팅 미읽음 + 배달 주문(접수·환불) + 미답변 문의 + 배달채팅 미읽음.
 * `chatUnread` = 거래채팅(`/chats`·trade segment) — 메신저에 연동된 `item_trade` 방은 제외해 CM unread 와 이중 집계 없음.
 * `communityMessengerUnread` = SAMarket 메신저(`community_messenger_participants`) — 하단 「메신저」탭.
 * `philifeChatUnread` = 커뮤니티·일반 DM 등(커뮤니티 계열 참가자 미읽음) — 「커뮤니티」탭 뱃지.
 * `socialChatUnread` = 거래+필라이프 등(chat_rooms/product_chats) 합. `storesTabAttention`은 「배달」탭.
 * GET /api/me/store-owner-hub-badge — 비로그인 시 total 0
 * 서버 단기 캐시: `lib/chats/owner-hub-badge-cache.ts` — 클라 정책 표는 `docs/messenger-realtime-policy.md`
 *
 * 세그먼트(동일 집계 로직 분리): `.../unreads`, `.../store-attention`
 */
import { NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getCachedOwnerHubBadge } from "@/lib/chats/owner-hub-badge-cache";
import { buildOwnerHubBadgePayloadMerged } from "@/lib/chats/build-owner-hub-badge-payload";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const bypassShortCache = new URL(request.url).searchParams.get("cmFresh") === "1";
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    if (process.env.NODE_ENV === "production") {
      console.error("[store-owner-hub-badge] NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 미설정");
    }
    return NextResponse.json({
      ok: true,
      degraded: true,
      total: 0,
      chatUnread: 0,
      communityMessengerUnread: 0,
      philifeChatUnread: 0,
      socialChatUnread: 0,
      storeOrderChatUnread: 0,
      orderAttention: 0,
      inquiryAttention: 0,
      storesTabAttention: 0,
      storeDeepLink: null,
    });
  }

  const userId = await getOptionalAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({
      ok: true,
      total: 0,
      chatUnread: 0,
      communityMessengerUnread: 0,
      philifeChatUnread: 0,
      socialChatUnread: 0,
      storeOrderChatUnread: 0,
      orderAttention: 0,
      inquiryAttention: 0,
      storesTabAttention: 0,
      storeDeepLink: null,
    });
  }

  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  const storesSb = tryGetSupabaseForStores();

  const payload = bypassShortCache
    ? await buildOwnerHubBadgePayloadMerged(sbAny, storesSb, userId)
    : await getCachedOwnerHubBadge(userId, async () => buildOwnerHubBadgePayloadMerged(sbAny, storesSb, userId));

  return NextResponse.json(payload);
}
