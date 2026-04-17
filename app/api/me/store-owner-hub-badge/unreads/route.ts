/**
 * 허브 배지 1차 세그먼트: 채팅·메신저·매장 주문채팅 unread (스토어 허브 접수/문의 없음).
 * 응답은 `segment` 외 필드만으로도 `mergeOwnerHubBadgeUnreadAndStore` 입력으로 사용 가능.
 */
import { NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { buildOwnerHubBadgeUnreadSegment } from "@/lib/chats/build-owner-hub-badge-payload";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({
      ok: true,
      segment: "unreads" as const,
      degraded: true,
      chatUnread: 0,
      communityMessengerUnread: 0,
      philifeChatUnread: 0,
      socialChatUnread: 0,
      storeOrderChatUnread: 0,
    });
  }

  const userId = await getOptionalAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({
      ok: true,
      segment: "unreads" as const,
      chatUnread: 0,
      communityMessengerUnread: 0,
      philifeChatUnread: 0,
      socialChatUnread: 0,
      storeOrderChatUnread: 0,
    });
  }

  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;
  const storesSb = tryGetSupabaseForStores();
  const partial = await buildOwnerHubBadgeUnreadSegment(sbAny, storesSb, userId);
  return NextResponse.json({ ok: true as const, segment: "unreads" as const, ...partial });
}
